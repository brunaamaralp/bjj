/**
 * PATCH /api/sales — action cancelar
 * Cancela venda (estoque + Caixa). Financeiro antes do estoque.
 */
import { Query } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  isAcademyOwnerOrAdminUser,
  databases,
  DB_ID,
} from './academyAccess.js';
import { itemDisplayName } from '../../functions/stockBalance.mjs';
import {
  buildCancelStockPatch,
  cancelStockMoveTipoForLineKind,
  normalizeLineKind,
} from '../../src/lib/saleLineKind.js';
import { saleBelongsToAcademy } from './saleAcademyScope.js';
import { cancelSaleFinancials } from './saleCancelFinancials.js';
import { updateDocumentResilient } from './appwriteSchemaResilient.js';
import { createStockMoveDocument } from './stockMoveFields.js';
import { resolveStockDocument } from './productCatalogDb.js';
import { recordAuditEvent, actorFromMe } from './auditLog.js';
import { AUDIT_EVENTS } from './auditEventTypes.js';
import { roundMoney } from './salePayments.js';
import { closeKimonoLoansForSale } from './kimonoLoanRecords.js';

const STOCK_ITEMS_COL =
  process.env.STOCK_ITEMS_COL || process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || '';
const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

const CANCELLABLE = new Set(['concluida', 'pendente', 'parcial']);

function json(res, status, body) {
  res.status(status).json(body);
}

async function listSaleItems(vendaId) {
  const res = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
    Query.equal('venda_id', vendaId),
    Query.limit(1000),
  ]);
  return res.documents || [];
}

export async function revertSaleItemsStock({
  itens,
  venda,
  vendaId,
  academyId,
  motivo,
  usuarioId,
  usuarioName,
}) {
  const revertedItems = [];

  for (const it of itens) {
    const qty = Number(it.quantidade || 0);
    if (qty <= 0) continue;

    const stockId = String(it.product_variant_id || it.item_estoque_id || '').trim();
    const resolved = await resolveStockDocument(databases, DB_ID, STOCK_ITEMS_COL, stockId);
    if (!resolved?.doc) {
      const err = new Error('stock_item_not_found');
      err.code = 'stock_item_not_found';
      throw err;
    }
    const itemStock = resolved.doc;
    const stockCol = resolved.collectionId || STOCK_ITEMS_COL;
    const stockAcademyId = String(itemStock.academy_id || itemStock.academyId || '').trim();
    if (stockAcademyId && stockAcademyId !== String(academyId)) {
      const err = new Error('forbidden');
      err.code = 'forbidden';
      throw err;
    }

    const lineKind = normalizeLineKind(it.line_kind);
    const stockPatch = buildCancelStockPatch(itemStock, qty, lineKind);

    await updateDocumentResilient(databases, DB_ID, stockCol, stockId, {
      ...stockPatch,
      last_updated: new Date().toISOString(),
    });

    const unitPrice = Number(it.preco_unitario) || 0;
    const isRental = lineKind === 'rental';
    const movePayload = {
      item_estoque_id: stockId,
      tipo: cancelStockMoveTipoForLineKind(lineKind),
      quantidade: qty,
      referencia_id: vendaId,
      motivo: isRental ? 'cancelamento_aluguel' : motivo,
      usuario_id: usuarioId,
      academy_id: academyId || itemStock.academy_id || null,
      movement_kind: isRental ? 'rental' : 'return',
      sale_id: vendaId,
      sale_item_id: it.$id || null,
      lead_id: venda.aluno_id || null,
      product_id: itemStock.product_id || null,
      unit_price: unitPrice > 0 ? roundMoney(unitPrice) : null,
      line_total: unitPrice > 0 ? roundMoney(unitPrice * qty) : null,
      payment_status_at_move: 'cancelled',
      usuario_name: usuarioName || null,
      notes: String(motivo || '').trim().slice(0, 512) || null,
      source: 'pos',
    };

    await createStockMoveDocument(databases, {
      dbId: DB_ID,
      stockMovesCol: STOCK_MOVES_COL,
      payload: movePayload,
    });

    revertedItems.push({
      item_estoque_id: stockId,
      display_label: itemDisplayName(itemStock),
      quantidade: qty,
    });
  }

  return revertedItems;
}

export default async function salesCancelHandler(req, res) {
  if (!DB_ID || !SALES_COL || !SALE_ITEMS_COL || !STOCK_ITEMS_COL || !STOCK_MOVES_COL) {
    return json(res, 503, { ok: false, error: 'sales_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const vendaId = String(body?.id || body?.venda_id || '').trim();
  const motivo = String(body?.motivo || '').trim();
  const idempotencyKey = String(body?.idempotency_key || body?.cancel_idempotency_key || '').trim();

  if (!vendaId) return json(res, 400, { ok: false, error: 'invalid_payload' });
  if (!motivo) return json(res, 400, { ok: false, error: 'motivo_required' });

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, academyDoc } = access;

  const bodyAid = String(body?.academy_id || '').trim();
  if (bodyAid && bodyAid !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const canCancel = await isAcademyOwnerOrAdminUser(academyDoc, me);
  if (!canCancel) {
    return json(res, 403, { ok: false, error: 'forbidden_role' });
  }

  let venda;
  try {
    venda = await databases.getDocument(DB_ID, SALES_COL, vendaId);
  } catch {
    return json(res, 404, { ok: false, error: 'not_found' });
  }

  if (!saleBelongsToAcademy(venda, academyId)) {
    return json(res, 403, { ok: false, error: 'forbidden_sale_academy' });
  }

  const vendaAcademyId = String(venda.academyId || venda.academy_id || '').trim();
  if (!vendaAcademyId) {
    return json(res, 400, { ok: false, error: 'academy_missing' });
  }

  const statusNow = String(venda.status || '').toLowerCase();

  if (statusNow === 'cancelada') {
    return json(res, 200, {
      ok: true,
      status: 'cancelada',
      venda_id: vendaId,
      cancelada_em: venda.cancelada_em || null,
      cancel_motivo: venda.cancel_motivo || motivo,
      refund_total: 0,
      items: [],
    });
  }

  if (statusNow === 'cancelling') {
    return json(res, 409, { ok: false, error: 'cancel_in_progress' });
  }

  if (!CANCELLABLE.has(statusNow)) {
    return json(res, 400, { ok: false, error: 'invalid_status' });
  }

  const previousStatus = statusNow;
  const usuarioId = String(me.$id || '').trim();
  const usuarioName = String(me.name || me.email || '').trim();

  try {
    await updateDocumentResilient(databases, DB_ID, SALES_COL, vendaId, {
      status: 'cancelling',
      ...(idempotencyKey ? { cancel_idempotency_key: idempotencyKey } : {}),
    });
  } catch (e) {
    console.error('[salesCancel] cancelling patch:', e);
    return json(res, 500, { ok: false, error: 'server_error' });
  }

  let refund_total = 0;
  try {
    const fin = await cancelSaleFinancials(databases, {
      dbId: DB_ID,
      financialTxCol: FINANCIAL_TX_COL,
      vendaId,
      venda,
      academyId: vendaAcademyId,
    });
    refund_total = fin.refund_total;
  } catch (e) {
    console.error('[salesCancel] financial:', e);
    try {
      await updateDocumentResilient(databases, DB_ID, SALES_COL, vendaId, {
        status: previousStatus,
        cancel_idempotency_key: '',
      });
    } catch {
      void 0;
    }
    return json(res, 500, {
      ok: false,
      error: 'financial_refund_failed',
      detail: String(e?.message || e),
    });
  }

  let revertedItems = [];
  try {
    const itens = await listSaleItems(vendaId);
    revertedItems = await revertSaleItemsStock({
      itens,
      venda,
      vendaId,
      academyId: vendaAcademyId,
      motivo,
      usuarioId,
      usuarioName,
    });
    await closeKimonoLoansForSale(databases, DB_ID, {
      academyId: vendaAcademyId,
      saleId: vendaId,
      returnedByUserId: usuarioId,
    }).catch((e) => {
      console.warn('[salesCancel] kimono_loan_close:', e?.message || e);
    });
  } catch (e) {
    console.error('[salesCancel] stock:', e);
    return json(res, 500, {
      ok: false,
      error: 'stock_revert_failed',
      detail: String(e?.message || e),
      partial_failure: true,
      refund_total,
    });
  }

  const cancelada_em = new Date().toISOString();
  await updateDocumentResilient(databases, DB_ID, SALES_COL, vendaId, {
    status: 'cancelada',
    cancelada_em,
    cancel_motivo: motivo.slice(0, 256),
    ...(idempotencyKey ? { cancel_idempotency_key: idempotencyKey } : {}),
  });

  recordAuditEvent({
    eventType: AUDIT_EVENTS.SALES_CANCELLED,
    academyId: vendaAcademyId,
    actor: actorFromMe(me),
    target: { type: 'sale', id: vendaId },
    source: 'api.sales.patch.cancelar',
    payload: {
      sale_id: vendaId,
      motivo: motivo.slice(0, 128),
      refund_total,
      status_before: previousStatus,
    },
  }).catch((e) => console.warn('[salesCancel] audit:', e?.message || e));

  console.log(
    JSON.stringify({
      level: 'info',
      action: 'sales_cancel',
      venda_id: vendaId,
      academy_id: vendaAcademyId,
      refund_total,
    })
  );

  return json(res, 200, {
    ok: true,
    status: 'cancelada',
    venda_id: vendaId,
    cancelada_em,
    cancel_motivo: motivo,
    refund_total,
    items: revertedItems,
  });
}
