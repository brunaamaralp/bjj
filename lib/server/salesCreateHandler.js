/**
 * POST /api/sales — criação de venda com validação multi-tenant.
 */
import { Query, ID } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  isAcademyOwnerOrAdminUser,
  databases,
  DB_ID,
} from './academyAccess.js';
import { itemDisplayName } from '../../functions/stockBalance.mjs';
import {
  normalizePagamentosInput,
  validatePagamentosForSettlement,
  buildFormaPagamentoResumo,
  roundMoney,
} from './salePayments.js';
import { readSalesSettings, normalizeSaleSource } from '../../src/lib/salesSettings.js';
import { notifyAcademyOwner } from './notifyAcademy.js';
import { recordFinancialAudit } from './financialAuditLog.js';
import { recordAuditEvent, actorFromMe } from './auditLog.js';
import { AUDIT_EVENTS } from './auditEventTypes.js';
import {
  mirrorSaleFinancials,
  mirrorSaleFinancialsForDoc,
  mirrorDeferredSale,
  mirrorSaleFinancialsByLineKinds,
} from './salesMirror.js';
import { resolveStockDocument, PRODUCT_VARIANTS_COL, isParentVariantCatalogEnabled } from './productCatalogDb.js';
import { recordSaleItemCmv } from './saleCmv.js';
import { variantInventoryLabel } from '../../src/lib/stockInventory.js';
import { parseFinanceConfig } from './financeTxFields.js';
import { validateAndNormalizeSalePayments } from './salePaymentRules.js';
import {
  availableQuantityForLineKind,
  buildSaleStockPatch,
  financeCategoryKeyForLineKind,
  normalizeLineKind,
  patchFromStockSnapshot,
  stockSnapshotForRollback,
  suggestUnitPriceForLineKind,
  validateLineKindForParent,
} from '../../src/lib/saleLineKind.js';
import {
  buildSaleStockMovePayload,
  cmvUnitFromTotals,
  createStockMoveDocument,
  derivePaymentStatusAtMove,
  paymentMethodFromPagamentos,
} from './stockMoveFields.js';
import { createDocumentResilient, updateDocumentResilient } from './appwriteSchemaResilient.js';
import { assertCashShiftForSale, findOpenCashShift } from './cashShiftHandler.js';
import { recordKimonoLoanAfterRentalExit } from './kimonoLoanRecords.js';
import { resolveBorrowerFromSale } from '../../src/lib/kimonoLoanBorrower.js';

const STOCK_ITEMS_COL =
  process.env.STOCK_ITEMS_COL || process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || '';
const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';
function json(res, status, body) {
  res.status(status).json(body);
}

function validateCollaboratorPrice(unit, stockDoc, isOwner) {
  const sale = Number(stockDoc?.sale_price ?? stockDoc?.preco_venda);
  const cost = Number(stockDoc?.cost_price ?? stockDoc?.preco_custo);
  const hasSale = Number.isFinite(sale) && sale > 0;
  const hasCost = Number.isFinite(cost) && cost > 0;
  const max = hasSale ? sale : hasCost ? cost : null;
  if (max != null && unit > max + 0.009) {
    return { ok: false, error: 'collaborator_price_above_max' };
  }
  if (hasCost && unit < cost - 0.009 && !isOwner) {
    return { ok: false, error: 'collaborator_price_below_cost' };
  }
  return { ok: true };
}

async function loadStockItem(itemId, academyId) {
  const resolved = await resolveStockDocument(databases, DB_ID, STOCK_ITEMS_COL, itemId);
  if (!resolved) {
    const err = new Error('not_found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (resolved.parentProductOnly) {
    const err = new Error('parent_product_id_not_variant');
    err.code = 'PARENT_NOT_VARIANT';
    throw err;
  }
  const doc = resolved.doc;
  const docAcademy = String(doc.academy_id || doc.academyId || '').trim();
  if (docAcademy && docAcademy !== academyId) {
    const err = new Error('forbidden_item');
    err.code = 'FORBIDDEN_ITEM';
    throw err;
  }
  return {
    doc,
    col: resolved.collection || STOCK_ITEMS_COL,
    parent: resolved.parent,
    suggested_price: resolved.suggested_price ?? null,
    suggested_cost: resolved.suggested_cost ?? null,
  };
}

function stockDocForCmv(itemDoc, suggestedCost) {
  const override = Number(suggestedCost);
  if (!Number.isFinite(override) || override < 0) return itemDoc;
  return {
    ...itemDoc,
    average_cost: override,
    last_purchase_cost: override,
  };
}

export default async function salesCreateHandler(req, res) {
  try {
    return await salesCreateHandlerCore(req, res);
  } catch (err) {
    console.error('[salesCreate] unhandled', err);
    return json(res, 500, {
      ok: false,
      error: 'create_failed',
      detail: String(err?.message || err),
    });
  }
}

async function salesCreateHandlerCore(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  if (!SALES_COL || !SALE_ITEMS_COL || !DB_ID) {
    return json(res, 503, { ok: false, error: 'sales_not_configured' });
  }
  const stockCatalogReady =
    Boolean(STOCK_ITEMS_COL) || (isParentVariantCatalogEnabled() && PRODUCT_VARIANTS_COL);
  if (!stockCatalogReady) {
    return json(res, 503, { ok: false, error: 'sales_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;
  const financeConfig = parseFinanceConfig(academyDoc?.financeConfig);
  const isOwner = await isAcademyOwnerOrAdminUser(academyDoc, me);

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const {
    aluno_id = null,
    forma_pagamento,
    pagamentos: pagamentosRaw,
    itens,
    idempotency_key = null,
    cliente_nome = null,
    cliente_telefone = null,
    venda_colaborador = false,
    deferred: deferredRaw = false,
    due_date: dueDateRaw = null,
    sale_source: saleSourceRaw = null,
  } = body || {};

  const deferred = deferredRaw === true;
  const dueDateYmd = String(dueDateRaw || '').trim().slice(0, 10);
  const dueDateValid = /^\d{4}-\d{2}-\d{2}$/.test(dueDateYmd);

  const bodyAid = String(body.academy_id || '').trim();
  if (bodyAid && bodyAid !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  if (!Array.isArray(itens) || itens.length === 0) {
    return json(res, 400, { ok: false, error: 'invalid_payload' });
  }

  const salesSettings = readSalesSettings(academyDoc.settings);
  const saleSource = normalizeSaleSource(saleSourceRaw);
  const shiftCheck = await assertCashShiftForSale(academyDoc, academyId, { saleSource });
  if (!shiftCheck.ok) {
    return json(res, 400, { ok: false, error: shiftCheck.error });
  }
  let cashShiftId = shiftCheck.shiftId || null;
  if (!cashShiftId) {
    const openShift = await findOpenCashShift(academyId);
    if (openShift?.$id) cashShiftId = openShift.$id;
  }
  const collaborator = venda_colaborador === true;
  const userId = me.$id;
  const userName = String(me.name || me.email || 'Usuário').slice(0, 128);

  for (const it of itens) {
    const q = Number(it.quantidade);
    if (!Number.isInteger(q) || q < 1) {
      return json(res, 400, { ok: false, error: 'quantidade_invalida' });
    }
    if (!it.item_estoque_id || typeof it.preco_unitario !== 'number') {
      return json(res, 400, { ok: false, error: 'invalid_item' });
    }
  }

  const hasPagamentos = Array.isArray(pagamentosRaw) && pagamentosRaw.length > 0;
  if (deferred) {
    if (!dueDateValid) {
      return json(res, 400, { ok: false, error: 'due_date_required' });
    }
  } else if (!hasPagamentos && !forma_pagamento) {
    return json(res, 400, { ok: false, error: 'invalid_payload' });
  }

  if (idempotency_key) {
    try {
      const existing = await databases.listDocuments(DB_ID, SALES_COL, [
        Query.equal('idempotency_key', idempotency_key),
        Query.limit(1),
      ]);
      if (existing.total > 0) {
        const doc = existing.documents[0];
        const st = String(doc.status || '').toLowerCase();
        if (st === 'concluida') {
          await mirrorSaleFinancialsForDoc(doc, academyDoc);
        } else if (st === 'pendente' && doc.deferred === true) {
          let description = 'Venda de produtos';
          try {
            const snap = JSON.parse(doc.itens_snapshot_json || '[]');
            if (Array.isArray(snap) && snap.length) {
              description =
                snap
                  .map((l) =>
                    Number(l.quantidade) > 1 ? `${l.label} x${l.quantidade}` : l.label
                  )
                  .join(', ') || description;
            }
          } catch {
            void 0;
          }
          await mirrorDeferredSale({
            vendaId: doc.$id,
            totalRounded: Number(doc.total || 0),
            description,
            academyId,
            aluno_id: doc.aluno_id,
            due_date: doc.due_date,
          });
        }
        return json(res, 200, {
          ok: true,
          venda_id: doc.$id,
          total: Number(doc.total || 0),
          status: String(doc.status || ''),
          idempotent: true,
        });
      }
    } catch {
      void 0;
    }
  }

  const stockDocs = {};
  const normalizedLines = [];

  try {
    for (const it of itens) {
      const q = Number(it.quantidade);
      const loaded = await loadStockItem(String(it.item_estoque_id), academyId);
      const stock = loaded.doc;
      const canonicalId = String(stock.$id || it.item_estoque_id);
      stockDocs[canonicalId] = loaded;

      const parentType = loaded.parent?.type || stock.type || 'sale';
      const lineKind = normalizeLineKind(it.line_kind);
      const kindCheck = validateLineKindForParent(parentType, lineKind);
      if (!kindCheck.ok) {
        return json(res, 400, {
          ok: false,
          error: kindCheck.error,
          item_estoque_id: it.item_estoque_id,
          nome: itemDisplayName(stock),
        });
      }

      const disponivel = availableQuantityForLineKind(stock, lineKind, parentType);
      const expected = Number(it.expected_quantity);
      if (Number.isFinite(expected) && expected !== disponivel) {
        return json(res, 409, {
          error: 'stock_stale',
          item_estoque_id: it.item_estoque_id,
          disponivel,
          expected,
          line_kind: lineKind,
          nome: itemDisplayName(stock),
        });
      }
      if (disponivel < q) {
        return json(res, 409, {
          error: 'no_stock',
          item_estoque_id: it.item_estoque_id,
          disponivel,
          line_kind: lineKind,
          nome: itemDisplayName(stock),
        });
      }

      let unit = roundMoney(it.preco_unitario);
      const suggestedSale = loaded.suggested_price;
      const suggestedCost = loaded.suggested_cost;
      const suggestedForKind = suggestUnitPriceForLineKind(loaded.parent, lineKind);
      const salePrice = Number(
        lineKind === 'rental'
          ? (suggestedForKind ?? loaded.parent?.rental_price)
          : (suggestedSale ?? loaded.parent?.sale_price ?? stock.sale_price ?? stock.preco_venda)
      );
      const costPrice = Number(
        suggestedCost ?? loaded.parent?.cost_price ?? stock.cost_price ?? stock.preco_custo
      );

      if (
        (!Number.isFinite(unit) || unit <= 0) &&
        Number.isFinite(salePrice) &&
        salePrice > 0
      ) {
        unit = roundMoney(salePrice);
      }

      if (salesSettings.lockPriceEdit && !collaborator) {
        if (!Number.isFinite(salePrice) || salePrice <= 0) {
          return json(res, 400, {
            ok: false,
            error: lineKind === 'rental' ? 'rental_price_not_configured' : 'price_not_configured',
            item: itemDisplayName(stock),
          });
        }
        unit = roundMoney(salePrice);
      } else if (collaborator && lineKind !== 'rental') {
        const priceCtx = {
          ...stock,
          sale_price: Number.isFinite(salePrice) ? salePrice : stock.sale_price,
          cost_price: Number.isFinite(costPrice) ? costPrice : stock.cost_price,
        };
        const check = validateCollaboratorPrice(unit, priceCtx, isOwner);
        if (!check.ok) return json(res, 400, { ok: false, error: check.error });
        if (Number.isFinite(costPrice) && costPrice > 0 && unit < costPrice - 0.009 && isOwner) {
          /* owner may sell below cost */
        }
      }

      const productId =
        String(loaded.parent?.id || stock.product_id || '').trim() || null;
      const parentName = loaded.parent?.nome || itemDisplayName(stock);
      const vLabel =
        loaded.col === PRODUCT_VARIANTS_COL
          ? `${parentName} · ${variantInventoryLabel({
              size: stock.size,
              color: stock.color,
              Tamanho: stock.Tamanho,
            })}`
          : parentName;

      normalizedLines.push({
        item_estoque_id: canonicalId,
        quantidade: q,
        preco_unitario: unit,
        label: vLabel,
        product_id: productId,
        line_kind: lineKind,
        suggested_cost: suggestedCost,
        stock_doc_cmv: lineKind === 'rental' ? null : stockDocForCmv(stock, suggestedCost),
      });
    }
  } catch (e) {
    if (e.code === 'FORBIDDEN_ITEM') {
      return json(res, 403, { ok: false, error: 'forbidden_item' });
    }
    if (e.code === 'NOT_FOUND') {
      return json(res, 404, { ok: false, error: 'item_not_found' });
    }
    if (e.code === 'PARENT_NOT_VARIANT') {
      return json(res, 400, { ok: false, error: 'parent_not_variant' });
    }
    throw e;
  }

  const totalVenda = normalizedLines.reduce((acc, it) => acc + it.preco_unitario * it.quantidade, 0);
  const totalRounded = roundMoney(totalVenda);

  let pagamentosNorm = [];
  let formaFinal = String(forma_pagamento || '').trim();
  let pagamentosJson = null;
  // Resultado da validação de liquidação (null em vendas a prazo ou legado
  // com apenas forma_pagamento). Precisa ter escopo de função porque é lido
  // na etapa de finalização abaixo, fora do bloco `hasPagamentos`.
  let check = null;

  if (deferred) {
    pagamentosNorm = [];
    formaFinal = 'A receber';
  } else if (hasPagamentos) {
    pagamentosNorm = normalizePagamentosInput(pagamentosRaw);
    if (!pagamentosNorm.length) return json(res, 400, { ok: false, error: 'invalid_pagamentos' });
    const paymentRules = validateAndNormalizeSalePayments(financeConfig, pagamentosNorm);
    if (!paymentRules.ok) {
      return json(res, 400, { ok: false, ...paymentRules });
    }
    pagamentosNorm = paymentRules.payments;
    check = validatePagamentosForSettlement(pagamentosNorm, totalRounded, { allowPartial: true });
    if (!check.ok) {
      return json(res, 400, {
        ok: false,
        error: check.reason === 'zero_payment' ? 'invalid_pagamentos' : 'pagamentos_total_mismatch',
        expected: totalRounded,
        received: check.net,
      });
    }
    formaFinal = buildFormaPagamentoResumo(pagamentosNorm);
    pagamentosJson = JSON.stringify(pagamentosNorm);
    if (pagamentosJson.length > 1024) {
      return json(res, 400, { ok: false, error: 'pagamentos_json_too_large' });
    }
  }

  const itensSnapshot = JSON.stringify(
    normalizedLines.map((l) => ({
      item_estoque_id: l.item_estoque_id,
      quantidade: l.quantidade,
      preco_unitario: l.preco_unitario,
      label: l.label,
      line_kind: l.line_kind,
    }))
  );

  const paymentStatusAtMove = deferred
    ? 'pending'
    : derivePaymentStatusAtMove(pagamentosNorm, totalRounded);
  const paymentMethodAtMove = paymentMethodFromPagamentos(pagamentosNorm);

  const vendaId = ID.unique();
  const idemKey = String(idempotency_key || ID.unique()).trim();
  const salePayload = {
    academy_id: academyId,
    academyId,
    total: totalRounded,
    forma_pagamento: formaFinal,
    status: 'rascunho',
    idempotency_key: idemKey,
    ...(cashShiftId ? { cash_shift_id: cashShiftId } : {}),
    created_by: userId,
    created_by_name: userName,
    itens_snapshot_json: itensSnapshot.slice(0, 8000),
  };
  if (aluno_id) salePayload.aluno_id = String(aluno_id);
  if (pagamentosJson) salePayload.pagamentos_json = pagamentosJson;
  if (cliente_nome) salePayload.cliente_nome = String(cliente_nome).slice(0, 128);
  if (cliente_telefone) salePayload.cliente_telefone = String(cliente_telefone).slice(0, 20);
  if (collaborator) salePayload.venda_colaborador = true;
  if (deferred) {
    salePayload.deferred = true;
    salePayload.due_date = dueDateYmd;
  }

  const vendaDoc = await createDocumentResilient(databases, DB_ID, SALES_COL, vendaId, salePayload);

  const stockSnapshots = {};
  const stockMoveWarnings = [];

  try {
    for (const it of normalizedLines) {
      const loaded = stockDocs[it.item_estoque_id];
      const itemDoc = loaded.doc;
      const stockCol = loaded.col || STOCK_ITEMS_COL;
      const saleItem = await createDocumentResilient(databases, DB_ID, SALE_ITEMS_COL, ID.unique(), {
        venda_id: vendaDoc.$id,
        item_estoque_id: it.item_estoque_id,
        product_variant_id: it.item_estoque_id,
        quantidade: it.quantidade,
        preco_unitario: it.preco_unitario,
        line_kind: it.line_kind,
      });

      stockSnapshots[it.item_estoque_id] = {
        id: it.item_estoque_id,
        col: stockCol,
        snap: stockSnapshotForRollback(itemDoc),
      };

      const stockPatch = buildSaleStockPatch(itemDoc, it.quantidade, it.line_kind);
      await updateDocumentResilient(databases, DB_ID, stockCol, it.item_estoque_id, {
        ...stockPatch,
        last_updated: new Date().toISOString(),
      });

      const vLabel = it.label || itemDisplayName(itemDoc);

      let cmvResult = { cmv: 0, financial_tx_id: null };
      if (it.line_kind !== 'rental' && it.stock_doc_cmv) {
        try {
          cmvResult = await recordSaleItemCmv(databases, {
            dbId: DB_ID,
            saleItemsCol: SALE_ITEMS_COL,
            saleItemId: saleItem.$id,
            saleItemPatch: {},
            stockDoc: it.stock_doc_cmv,
            variantLabel: vLabel,
            quantity: it.quantidade,
            academyId,
            vendaId: vendaDoc.$id,
            settledAt: new Date().toISOString(),
          });
        } catch (cmvErr) {
          console.warn('[salesCreate] cmv skipped', cmvErr?.message || cmvErr);
        }
      }

      if (STOCK_MOVES_COL) {
        const lineTotal = roundMoney(it.preco_unitario * it.quantidade);
        const movePayload = buildSaleStockMovePayload({
          academyId,
          itemEstoqueId: it.item_estoque_id,
          quantidade: it.quantidade,
          vendaId: vendaDoc.$id,
          saleItemId: saleItem.$id,
          productId: it.product_id,
          leadId: aluno_id || null,
          unitPrice: it.preco_unitario,
          lineTotal,
          paymentStatusAtMove,
          paymentMethod: paymentMethodAtMove,
          usuarioId: userId,
          usuarioName: userName,
          cmvUnit: cmvUnitFromTotals(cmvResult.cmv, it.quantidade, it.stock_doc_cmv || itemDoc),
          lineKind: it.line_kind,
        });
        const moveDoc = await createStockMoveDocument(databases, {
          dbId: DB_ID,
          stockMovesCol: STOCK_MOVES_COL,
          payload: movePayload,
        });
        if (!moveDoc) {
          throw new Error(`stock_move_create_failed:${it.item_estoque_id}`);
        }

        if (it.line_kind === 'rental') {
          const loaded = stockDocs[it.item_estoque_id];
          await recordKimonoLoanAfterRentalExit(databases, {
            dbId: DB_ID,
            stockItemsCol: STOCK_ITEMS_COL,
            academyId,
            variantId: it.item_estoque_id,
            resolved: loaded,
            quantity: it.quantidade,
            stockMoveOutId: moveDoc.$id,
            lentAt: moveDoc.$createdAt,
            borrower: resolveBorrowerFromSale({
              aluno_id,
              cliente_nome,
              saleId: vendaDoc.$id,
              saleSource,
            }),
            lentByUserId: userId,
            notes: `venda:${vendaDoc.$id}`,
            source: 'sale',
            move: moveDoc,
          }).catch((e) => {
            console.warn('[salesCreate] kimono_loan_record:', e?.message || e);
          });
        }
      }
    }

    const paymentComplete = check ? check.isComplete : true;
    const finalStatus = deferred ? 'pendente' : paymentComplete ? 'concluida' : 'parcial';
    await updateDocumentResilient(databases, DB_ID, SALES_COL, vendaDoc.$id, { status: finalStatus });

    const description = normalizedLines
      .map((l) => (l.quantidade > 1 ? `${l.label} x${l.quantidade}` : l.label))
      .join(', ') || 'Venda de produtos';

    const lineKindGross = normalizedLines.reduce((acc, l) => {
      const key = financeCategoryKeyForLineKind(l.line_kind);
      acc[key] = roundMoney((acc[key] || 0) + l.preco_unitario * l.quantidade);
      return acc;
    }, {});

    let mirrorResult;
    if (deferred) {
      mirrorResult = await mirrorDeferredSale({
        vendaId: vendaDoc.$id,
        totalRounded,
        description,
        academyId,
        aluno_id,
        due_date: dueDateYmd,
        lineKindGross,
      });
    } else if (check && !check.isComplete) {
      const paidMirror = await mirrorSaleFinancialsByLineKinds({
        vendaId: vendaDoc.$id,
        totalRounded: check.newPaid,
        pagamentosNorm,
        formaFinal,
        description,
        academyId,
        aluno_id,
        lineKindGross,
      });
      const pendingMirror = await mirrorDeferredSale({
        vendaId: vendaDoc.$id,
        totalRounded: check.remaining,
        description,
        academyId,
        aluno_id,
        due_date: dueDateYmd || null,
        lineKindGross,
      });
      mirrorResult = {
        warnings: [...(paidMirror.warnings || []), ...(pendingMirror.warnings || [])],
      };
    } else {
      mirrorResult = await mirrorSaleFinancialsByLineKinds({
        vendaId: vendaDoc.$id,
        totalRounded,
        pagamentosNorm,
        formaFinal,
        description,
        academyId,
        aluno_id,
        lineKindGross,
      });
    }
    const mirrorWarnings = [...stockMoveWarnings, ...(mirrorResult.warnings || [])];

    if (mirrorWarnings.length) {
      const shortId = String(vendaDoc.$id).slice(-4).toUpperCase();
      try {
        await notifyAcademyOwner(academyDoc, 'sale_mirror_failed', {
          venda_id: vendaDoc.$id,
          venda_short: shortId,
          warnings: mirrorWarnings.join('; '),
        });
      } catch {
        void 0;
      }
    }

    await recordFinancialAudit({
      action: 'sale_create',
      payment_id: vendaDoc.$id,
      academy_id: academyId,
      user_id: userId,
      amount: totalRounded,
      new_status: finalStatus,
    });

    recordAuditEvent({
      eventType: AUDIT_EVENTS.SALES_CREATED,
      academyId,
      actor: actorFromMe({ $id: userId, name: userName }),
      target: { type: 'sale', id: String(vendaDoc.$id), name: description.slice(0, 128) },
      context: aluno_id ? { lead_id: String(aluno_id) } : {},
      source: 'api.sales.post',
      payload: {
        sale_id: String(vendaDoc.$id),
        total: totalRounded,
        status: finalStatus,
        items_count: normalizedLines.length,
        cliente_nome: cliente_nome ? String(cliente_nome) : '',
      },
    }).catch((e) => console.warn('[salesCreate] Falha ao registrar auditoria:', e?.message || e));

    console.log(
      JSON.stringify({
        level: 'info',
        action: 'sales_create',
        venda_id: vendaDoc.$id,
        academy_id: academyId,
        user_id: userId,
        items_count: normalizedLines.length,
        total: totalRounded,
      })
    );

    return json(res, 200, {
      ok: true,
      venda_id: vendaDoc.$id,
      total: totalRounded,
      status: finalStatus,
      troco_warnings: mirrorWarnings,
    });
  } catch (err) {
    try {
      await databases.deleteDocument(DB_ID, SALES_COL, vendaDoc.$id);
    } catch {
      void 0;
    }
    for (const [itemId, snap] of Object.entries(stockSnapshots)) {
      try {
        await databases.updateDocument(DB_ID, snap.col, snap.id, patchFromStockSnapshot(snap.snap));
      } catch {
        void 0;
      }
    }
    console.error('[salesCreate]', err);
    return json(res, 500, {
      ok: false,
      error: 'create_failed',
      detail: String(err?.message || err),
      step: err?.step || 'sale_finalize',
    });
  }
}
