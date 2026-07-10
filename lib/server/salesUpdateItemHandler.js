/**
 * PATCH /api/sales — action alterar_item
 * Troca o produto de uma linha em venda concluída, pendente ou parcial (estoque + total + caixa).
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
import { readSalesSettings } from '../../src/lib/salesSettings.js';
import { parsePagamentosJson, roundMoney, salePaidAmountNet } from './salePayments.js';
import { refreshPendingSaleBalance } from './salesMirror.js';
import { recordFinancialAudit } from './financialAuditLog.js';
import { recordAuditEvent, actorFromMe } from './auditLog.js';
import { resolveStockDocument, PRODUCT_VARIANTS_COL } from './productCatalogDb.js';
import { recordSaleItemCmv } from './saleCmv.js';
import { variantInventoryLabel } from '../../src/lib/stockInventory.js';
import { parseFinanceConfig } from './financeTxFields.js';
import { mirrorAmountsForPaymentWithAccount } from '../../src/lib/resolveAcquirerFees.js';
import { financialTxSettlementFields } from '../../src/lib/paymentSettlement.js';
import { resolveSaleMirrorBankAccountForPayment } from './salePaymentRules.js';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import { competenceMonthFromIso } from '../../src/lib/financeCompetence.js';
import {
  availableQuantityForLineKind,
  buildCancelStockPatch,
  buildSaleStockPatch,
  cancelStockMoveTipoForLineKind,
  financeCategoryKeyForLineKind,
  normalizeLineKind,
  suggestUnitPriceForLineKind,
  validateLineKindForParent,
} from '../../src/lib/saleLineKind.js';
import {
  buildSaleStockMovePayload,
  cmvUnitFromTotals,
  createStockMoveDocument,
  paymentMethodFromPagamentos,
} from './stockMoveFields.js';
import { updateDocumentResilient } from './appwriteSchemaResilient.js';
import { financeTxDocumentWithOptionals } from './financeTxFields.js';
import { buildSaleDeltaRefundPayload } from './financeTxReversalIntegrity.js';
import { saleBelongsToAcademy } from './saleAcademyScope.js';

const STOCK_ITEMS_COL =
  process.env.STOCK_ITEMS_COL || process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || '';
const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

const SALE_REVENUE_TX_TYPES = new Set(['product', 'rental']);

function json(res, status, body) {
  res.status(status).json(body);
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

function variantLabelFromLoaded(loaded) {
  const stock = loaded.doc;
  const parentName = loaded.parent?.nome || itemDisplayName(stock);
  if (loaded.col === PRODUCT_VARIANTS_COL) {
    return `${parentName} · ${variantInventoryLabel({
      size: stock.size,
      color: stock.color,
      Tamanho: stock.Tamanho,
    })}`;
  }
  return parentName;
}

async function listSaleItems(vendaId) {
  const res = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
    Query.equal('venda_id', vendaId),
    Query.limit(500),
  ]);
  return res.documents || [];
}

async function listSaleFinancialTx(vendaId) {
  if (!FINANCIAL_TX_COL || !vendaId) return [];
  try {
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
      Query.equal('saleId', vendaId),
      Query.limit(25),
    ]);
    return res.documents || [];
  } catch {
    return [];
  }
}

async function rebuildSnapshotLines(vendaId, academyId) {
  const items = await listSaleItems(vendaId);
  const lines = [];
  for (const it of items) {
    const stockId = String(it.product_variant_id || it.item_estoque_id || '').trim();
    let label = 'Produto';
    try {
      const loaded = await loadStockItem(stockId, academyId);
      label = variantLabelFromLoaded(loaded);
    } catch {
      label = stockId.slice(-6) || 'Produto';
    }
    lines.push({
      item_estoque_id: stockId,
      quantidade: Number(it.quantidade) || 1,
      preco_unitario: roundMoney(Number(it.preco_unitario) || 0),
      label,
      line_kind: normalizeLineKind(it.line_kind),
    });
  }
  return lines;
}

async function applyStockRevertMove({
  academyId,
  vendaId,
  saleItemId,
  stockId,
  stockDoc,
  stockCol,
  qty,
  lineKind,
  unitPrice,
  leadId,
  userId,
  userName,
  motivo,
}) {
  const isRental = lineKind === 'rental';
  const movePayload = {
    item_estoque_id: stockId,
    tipo: cancelStockMoveTipoForLineKind(lineKind),
    quantidade: qty,
    referencia_id: vendaId,
    motivo: isRental ? 'troca_aluguel_reversao' : motivo,
    usuario_id: userId,
    academy_id: academyId,
    movement_kind: isRental ? 'rental' : 'return',
    sale_id: vendaId,
    sale_item_id: saleItemId,
    lead_id: leadId || null,
    product_id: stockDoc.product_id || null,
    unit_price: unitPrice > 0 ? roundMoney(unitPrice) : null,
    line_total: unitPrice > 0 ? roundMoney(unitPrice * qty) : null,
    payment_status_at_move: 'paid',
    usuario_name: userName || null,
    notes: motivo,
    source: 'pos',
  };
  await requireStockMoveDocument(databases, {
    dbId: DB_ID,
    stockMovesCol: STOCK_MOVES_COL,
    payload: movePayload,
  });
}

async function requireStockMoveDocument(databases, opts) {
  if (!STOCK_MOVES_COL) return null;
  const doc = await createStockMoveDocument(databases, opts);
  if (!doc) {
    throw new Error('stock_move_create_failed');
  }
  return doc;
}

async function syncFinanceAfterItemChange({
  vendaId,
  academyId,
  aluno_id,
  oldTotal,
  newTotal,
  description,
  saleDoc,
  financeConfig,
}) {
  if (!FINANCIAL_TX_COL) return;

  const saleStatus = String(saleDoc.status || '').toLowerCase();
  if (saleStatus === 'pendente' || saleStatus === 'parcial') {
    const txs = await listSaleFinancialTx(vendaId);
    for (const tx of txs) {
      const type = String(tx.type || '').toLowerCase();
      if (type === 'refund' || String(tx.origin_type || '').toLowerCase() === 'reversal') continue;
      if (String(tx.status || '').toLowerCase() === 'cancelled') continue;
      try {
        await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, tx.$id, {
          planName: description,
          note: description,
        });
      } catch {
        void 0;
      }
    }

    const paidAmount = roundMoney(salePaidAmountNet(saleDoc.pagamentos_json));
    const remaining = roundMoney(Math.max(0, newTotal - paidAmount));
    const items = await listSaleItems(vendaId);
    const lineKindGross = items.reduce((acc, it) => {
      const key = financeCategoryKeyForLineKind(normalizeLineKind(it.line_kind));
      const lineTotal = roundMoney((Number(it.preco_unitario) || 0) * (Number(it.quantidade) || 1));
      acc[key] = roundMoney((acc[key] || 0) + lineTotal);
      return acc;
    }, {});

    await refreshPendingSaleBalance({
      vendaId,
      academyId,
      aluno_id,
      remainingGross: remaining,
      description,
      due_date: saleDoc.due_date || null,
      lineKindGross,
    });
    return;
  }

  const txs = await listSaleFinancialTx(vendaId);
  const revenueTxs = txs.filter((d) => {
    const type = String(d.type || '').toLowerCase();
    if (type === 'refund' || type === 'stock_purchase') return false;
    if (String(d.origin_type || '').toLowerCase() === 'reversal') return false;
    if (String(d.status || '').toLowerCase() === 'cancelled') return false;
    const origin = String(d.origin_type || '').toLowerCase();
    if (SALE_REVENUE_TX_TYPES.has(type)) return true;
    return origin === 'sale' && type !== 'refund';
  });

  for (const tx of revenueTxs) {
    try {
      await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, tx.$id, {
        planName: description,
        note: description,
      });
    } catch {
      void 0;
    }
  }

  const activeRevenue = revenueTxs.filter((d) => String(d.status || '').toLowerCase() === 'settled');
  const currentRevenueTotal = roundMoney(
    activeRevenue.reduce((sum, d) => sum + (Number(d.gross) || 0), 0)
  );
  const delta = roundMoney(newTotal - currentRevenueTotal);
  if (Math.abs(delta) < 0.01) return;

  const shortId = String(vendaId).slice(-4).toUpperCase();
  const pagamentos = parsePagamentosJson(saleDoc.pagamentos_json);
  const p0 = pagamentos[0] || { forma: String(saleDoc.forma_pagamento || 'pix').split('+')[0].trim() };
  const method = String(p0.forma || 'pix').trim();
  const installments = Math.min(12, Math.max(1, Number(p0.installments) || 1));
  const bankAccount = resolveSaleMirrorBankAccountForPayment(financeConfig, p0, p0.bank_account || '');
  const nowIso = new Date().toISOString();
  const settlement = financialTxSettlementFields({
    financeConfig,
    method,
    paidAt: nowIso,
    captureMethodId: p0.capture_method_id || '',
    installments,
  });

  const primary =
    activeRevenue.length > 0
      ? [...activeRevenue].sort((a, b) => (Number(b.gross) || 0) - (Number(a.gross) || 0))[0]
      : null;

  if (primary) {
    const adjustedGross = roundMoney((Number(primary.gross) || 0) + delta);
    if (adjustedGross > 0) {
      const { fee, net } = mirrorAmountsForPaymentWithAccount({
        gross: adjustedGross,
        policy: financeConfig?.acquirerFeePolicy,
        method,
        installments,
        financeConfig,
        bankAccount: bankAccount || '',
        captureMethodId: p0.capture_method_id || '',
        feeReceiverId: p0.fee_receiver_id || '',
        cardBrand: p0.card_brand || '',
      });
      try {
        await databases.updateDocument(
          DB_ID,
          FINANCIAL_TX_COL,
          primary.$id,
          financeTxDocumentWithOptionals({
            planName: description,
            note: description,
            gross: adjustedGross,
            fee,
            net,
          })
        );
        return;
      } catch (e) {
        console.warn('[salesUpdateItem] finance adjust in-place', e?.message);
      }
    }
  }

  if (delta > 0) {
    const { fee, net } = mirrorAmountsForPaymentWithAccount({
      gross: delta,
      policy: financeConfig?.acquirerFeePolicy,
      method,
      installments,
      financeConfig,
      bankAccount: bankAccount || '',
      captureMethodId: p0.capture_method_id || '',
      feeReceiverId: p0.fee_receiver_id || '',
      cardBrand: p0.card_brand || '',
    });
    const cat = FINANCE_CATEGORIES.VENDA_PRODUTO;
    const note = `Ajuste troca produto — venda #${shortId}`;
    try {
      await databases.createDocument(
        DB_ID,
        FINANCIAL_TX_COL,
        ID.unique(),
        financeTxDocumentWithOptionals({
          academyId,
          saleId: vendaId,
          lead_id: aluno_id || '',
          method,
          installments,
          type: cat.type,
          category: cat.label,
          competence_month: competenceMonthFromIso(nowIso),
          planName: note,
          gross: delta,
          fee,
          net,
          direction: 'in',
          status: settlement.status,
          settledAt: settlement.settledAt,
          expected_settlement_at: settlement.expected_settlement_at,
          note,
          origin_type: 'sale',
          origin_id: vendaId,
          ...(p0.capture_method_id ? { capture_method_id: p0.capture_method_id } : {}),
          ...(bankAccount ? { bank_account: bankAccount } : {}),
        })
      );
    } catch (e) {
      console.warn('[salesUpdateItem] finance delta in', e?.message);
    }
    return;
  }

  if (!primary) return;

  const refundAmount = roundMoney(Math.abs(delta));
  const note = `Estorno parcial troca produto — venda #${shortId}`;
  try {
    await databases.createDocument(
      DB_ID,
      FINANCIAL_TX_COL,
      ID.unique(),
      financeTxDocumentWithOptionals(
        buildSaleDeltaRefundPayload({
          academyId,
          vendaId,
          originalTxId: primary.$id,
          refundAmount,
          method,
          competenceMonth: competenceMonthFromIso(nowIso),
          note,
          leadId: aluno_id || '',
          settledAt: nowIso,
        })
      )
    );
  } catch (e) {
    console.warn('[salesUpdateItem] finance delta out', e?.message);
  }
}

export default async function salesUpdateItemHandler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  if (!SALES_COL || !SALE_ITEMS_COL || !STOCK_ITEMS_COL || !DB_ID) {
    return json(res, 503, { ok: false, error: 'sales_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const isOwner = await isAcademyOwnerOrAdminUser(academyDoc, me);
  if (!isOwner) {
    return json(res, 403, { ok: false, error: 'forbidden_role' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const action = String(body?.action || '').trim().toLowerCase();
  if (action !== 'alterar_item') {
    return json(res, 400, { ok: false, error: 'invalid_payload' });
  }

  const vendaId = String(body?.id || body?.venda_id || '').trim();
  const saleItemId = String(body?.sale_item_id || '').trim();
  const novo = body?.novo_item || body?.item || {};
  const newStockId = String(novo.item_estoque_id || '').trim();
  const motivo = String(body?.motivo || 'troca_produto').trim().slice(0, 256);

  if (!vendaId || !saleItemId || !newStockId) {
    return json(res, 400, { ok: false, error: 'invalid_payload' });
  }

  const bodyAid = String(body.academy_id || '').trim();
  if (bodyAid && bodyAid !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  let saleDoc;
  try {
    saleDoc = await databases.getDocument(DB_ID, SALES_COL, vendaId);
  } catch {
    return json(res, 404, { ok: false, error: 'not_found' });
  }

  if (!saleBelongsToAcademy(saleDoc, academyId)) {
    return json(res, 403, { ok: false, error: 'forbidden_sale_academy' });
  }

  const status = String(saleDoc.status || '').toLowerCase();
  if (status !== 'concluida' && status !== 'pendente' && status !== 'parcial') {
    return json(res, 409, { ok: false, error: 'sale_not_concluded' });
  }

  let saleItemDoc;
  try {
    saleItemDoc = await databases.getDocument(DB_ID, SALE_ITEMS_COL, saleItemId);
  } catch {
    return json(res, 404, { ok: false, error: 'sale_item_not_found' });
  }

  if (String(saleItemDoc.venda_id || '') !== vendaId) {
    return json(res, 400, { ok: false, error: 'sale_item_mismatch' });
  }

  const oldStockId = String(saleItemDoc.product_variant_id || saleItemDoc.item_estoque_id || '').trim();
  if (oldStockId === newStockId) {
    return json(res, 400, { ok: false, error: 'same_item' });
  }

  const lineKind = normalizeLineKind(novo.line_kind || saleItemDoc.line_kind);
  let qty = Number(novo.quantidade ?? saleItemDoc.quantidade);
  if (!Number.isInteger(qty) || qty < 1) {
    return json(res, 400, { ok: false, error: 'quantidade_invalida' });
  }

  const userId = me.$id;
  const userName = String(me.name || me.email || 'Usuário').slice(0, 128);
  const salesSettings = readSalesSettings(academyDoc.settings);
  const financeConfig = parseFinanceConfig(academyDoc?.financeConfig);
  const oldTotal = roundMoney(Number(saleDoc.total) || 0);

  let oldLoaded;
  let newLoaded;
  try {
    oldLoaded = await loadStockItem(oldStockId, academyId);
    newLoaded = await loadStockItem(newStockId, academyId);
  } catch (e) {
    if (e.code === 'FORBIDDEN_ITEM') return json(res, 403, { ok: false, error: 'forbidden_item' });
    if (e.code === 'NOT_FOUND') return json(res, 404, { ok: false, error: 'item_not_found' });
    if (e.code === 'PARENT_NOT_VARIANT') {
      return json(res, 400, { ok: false, error: 'parent_not_variant' });
    }
    throw e;
  }

  const newParentType = newLoaded.parent?.type || newLoaded.doc.type || 'sale';
  const kindCheck = validateLineKindForParent(newParentType, lineKind);
  if (!kindCheck.ok) {
    return json(res, 400, { ok: false, error: kindCheck.error, item_estoque_id: newStockId });
  }

  const disponivel = availableQuantityForLineKind(newLoaded.doc, lineKind, newParentType);
  if (disponivel < qty) {
    return json(res, 409, {
      ok: false,
      error: 'no_stock',
      item_estoque_id: newStockId,
      disponivel,
      line_kind: lineKind,
      nome: itemDisplayName(newLoaded.doc),
    });
  }

  let unit = roundMoney(Number(novo.preco_unitario));
  const suggestedForKind = suggestUnitPriceForLineKind(newLoaded.parent, lineKind);
  const suggestedSale = newLoaded.suggested_price;
  const salePrice = Number(
    lineKind === 'rental'
      ? (suggestedForKind ?? newLoaded.parent?.rental_price)
      : (suggestedSale ?? newLoaded.parent?.sale_price ?? newLoaded.doc.sale_price ?? newLoaded.doc.preco_venda)
  );

  if ((!Number.isFinite(unit) || unit <= 0) && Number.isFinite(salePrice) && salePrice > 0) {
    unit = roundMoney(salePrice);
  }

  if (salesSettings.lockPriceEdit) {
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      return json(res, 400, {
        ok: false,
        error: lineKind === 'rental' ? 'rental_price_not_configured' : 'price_not_configured',
      });
    }
    unit = roundMoney(salePrice);
  } else if (!Number.isFinite(unit) || unit <= 0) {
    return json(res, 400, { ok: false, error: 'invalid_price' });
  }

  const oldQty = Math.max(1, Math.trunc(Number(saleItemDoc.quantidade) || 1));
  const oldUnit = roundMoney(Number(saleItemDoc.preco_unitario) || 0);
  const oldLineKind = normalizeLineKind(saleItemDoc.line_kind);

  const oldStockDoc = oldLoaded.doc;
  const oldStockCol = oldLoaded.col || STOCK_ITEMS_COL;
  const newStockDoc = newLoaded.doc;
  const newStockCol = newLoaded.col || STOCK_ITEMS_COL;

  const oldRevertPatch = buildCancelStockPatch(oldStockDoc, oldQty, oldLineKind);
  await updateDocumentResilient(databases, DB_ID, oldStockCol, oldStockId, {
    ...oldRevertPatch,
    last_updated: new Date().toISOString(),
  });

  if (STOCK_MOVES_COL) {
    await applyStockRevertMove({
      academyId,
      vendaId,
      saleItemId,
      stockId: oldStockId,
      stockDoc: oldStockDoc,
      stockCol: oldStockCol,
      qty: oldQty,
      lineKind: oldLineKind,
      unitPrice: oldUnit,
      leadId: saleDoc.aluno_id,
      userId,
      userName,
      motivo,
    });
  }

  const newStockPatch = buildSaleStockPatch(newStockDoc, qty, lineKind);
  await updateDocumentResilient(databases, DB_ID, newStockCol, newStockId, {
    ...newStockPatch,
    last_updated: new Date().toISOString(),
  });

  const vLabel = variantLabelFromLoaded(newLoaded);
  const productId = String(newLoaded.parent?.id || newStockDoc.product_id || '').trim() || null;

  await updateDocumentResilient(databases, DB_ID, SALE_ITEMS_COL, saleItemId, {
    item_estoque_id: newStockId,
    product_variant_id: newStockId,
    quantidade: qty,
    preco_unitario: unit,
    line_kind: lineKind,
  });

  const pagamentos = parsePagamentosJson(saleDoc.pagamentos_json);
  const paymentMethod = paymentMethodFromPagamentos(pagamentos);

  let cmvResult = { cmv: 0 };
  if (lineKind !== 'rental') {
    const stockCmv = stockDocForCmv(newStockDoc, newLoaded.suggested_cost);
    try {
      cmvResult = await recordSaleItemCmv(databases, {
        dbId: DB_ID,
        saleItemsCol: SALE_ITEMS_COL,
        saleItemId,
        saleItemPatch: {},
        stockDoc: stockCmv,
        variantLabel: vLabel,
        quantity: qty,
        academyId,
        vendaId,
        settledAt: new Date().toISOString(),
      });
    } catch (cmvErr) {
      console.warn('[salesUpdateItem] cmv skipped', cmvErr?.message || cmvErr);
    }
  }

  if (STOCK_MOVES_COL) {
    const lineTotal = roundMoney(unit * qty);
    const paymentStatusAtMove =
      status === 'concluida' ? 'paid' : status === 'parcial' ? 'partial' : 'pending';
    const movePayload = buildSaleStockMovePayload({
      academyId,
      itemEstoqueId: newStockId,
      quantidade: qty,
      vendaId,
      saleItemId,
      productId,
      leadId: saleDoc.aluno_id || null,
      unitPrice: unit,
      lineTotal,
      paymentStatusAtMove,
      paymentMethod,
      usuarioId: userId,
      usuarioName: userName,
      cmvUnit: cmvUnitFromTotals(cmvResult.cmv, qty, newStockDoc),
      lineKind,
      notes: motivo,
    });
    await requireStockMoveDocument(databases, {
      dbId: DB_ID,
      stockMovesCol: STOCK_MOVES_COL,
      payload: movePayload,
    });
  }

  const allItems = await listSaleItems(vendaId);
  const newTotal = roundMoney(
    allItems.reduce((acc, it) => acc + roundMoney(Number(it.preco_unitario) || 0) * (Number(it.quantidade) || 1), 0)
  );

  const snapshotLines = await rebuildSnapshotLines(vendaId, academyId);
  const itensSnapshot = JSON.stringify(
    snapshotLines.map((l) => ({
      item_estoque_id: l.item_estoque_id,
      quantidade: l.quantidade,
      preco_unitario: l.preco_unitario,
      label: l.label,
      line_kind: l.line_kind,
    }))
  );

  const description =
    snapshotLines.map((l) => (l.quantidade > 1 ? `${l.label} x${l.quantidade}` : l.label)).join(', ') ||
    'Venda de produtos';

  await updateDocumentResilient(databases, DB_ID, SALES_COL, vendaId, {
    total: newTotal,
    itens_snapshot_json: itensSnapshot.slice(0, 8000),
  });

  await syncFinanceAfterItemChange({
    vendaId,
    academyId,
    aluno_id: saleDoc.aluno_id,
    oldTotal,
    newTotal,
    description,
    saleDoc,
    financeConfig,
  });

  await recordFinancialAudit({
    action: 'sale_update_item',
    payment_id: vendaId,
    academy_id: academyId,
    user_id: userId,
    amount: newTotal,
    new_status: status,
  });

  void recordAuditEvent({
    event: 'sale.item_updated',
    academyId,
    actor: actorFromMe(me),
    target: { type: 'sale', id: vendaId },
    meta: { sale_item_id: saleItemId, old_stock_id: oldStockId, new_stock_id: newStockId },
  }).catch(() => {});

  console.log(
    JSON.stringify({
      level: 'info',
      action: 'sales_update_item',
      venda_id: vendaId,
      sale_item_id: saleItemId,
      old_total: oldTotal,
      new_total: newTotal,
    })
  );

  return json(res, 200, {
    ok: true,
    venda_id: vendaId,
    sale_item_id: saleItemId,
    total: newTotal,
    old_total: oldTotal,
    items: snapshotLines.map((l) => ({
      item_estoque_id: l.item_estoque_id,
      display_label: l.label,
      quantidade: l.quantidade,
      preco_unitario: l.preco_unitario,
      subtotal: roundMoney(l.preco_unitario * l.quantidade),
      line_kind: l.line_kind,
    })),
    description,
    line_kind: lineKind,
    finance_category: financeCategoryKeyForLineKind(lineKind),
  });
}
