/**
 * PATCH /api/sales — action cancelar
 * Cancela venda (estoque + Caixa). Financeiro antes do estoque.
 */
import {
  ensureAuth,
  ensureAcademyAccess,
  isAcademyOwnerOrAdminUser,
  databases,
  DB_ID,
} from './academyAccess.js';
import { saleBelongsToAcademy } from './saleAcademyScope.js';
import { cancelSaleFinancials } from './saleCancelFinancials.js';
import { updateDocumentResilient } from './appwriteSchemaResilient.js';
import { recordAuditEvent, actorFromMe } from './auditLog.js';
import { AUDIT_EVENTS } from './auditEventTypes.js';
import { closeKimonoLoansForSale } from './kimonoLoanRecords.js';
import {
  ensureSaleCancelStockRestored,
  revertSaleItemsStock as revertSaleItemsStockCore,
} from './saleCancelStock.js';

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

/** Compat: descartar rascunho e testes usam a forma antiga com defaults de env. */
export async function revertSaleItemsStock(opts) {
  return revertSaleItemsStockCore(databases, {
    dbId: DB_ID,
    stockItemsCol: STOCK_ITEMS_COL,
    stockMovesCol: STOCK_MOVES_COL,
    ...opts,
  });
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
  const { academyId, doc: academyDoc } = access;

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
  const usuarioId = String(me.$id || '').trim();
  const usuarioName = String(me.name || me.email || '').trim();

  // Venda já cancelada: reparar estoque se o estorno nunca rodou (falha parcial antiga).
  if (statusNow === 'cancelada') {
    try {
      const stock = await ensureSaleCancelStockRestored(databases, {
        dbId: DB_ID,
        vendaId,
        venda,
        academyId: vendaAcademyId,
        motivo: String(venda.cancel_motivo || motivo).trim() || motivo,
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
      return json(res, 200, {
        ok: true,
        status: 'cancelada',
        venda_id: vendaId,
        cancelada_em: venda.cancelada_em || null,
        cancel_motivo: venda.cancel_motivo || motivo,
        refund_total: 0,
        items: stock.items || [],
        stock_restored: Boolean(stock.restored),
        stock_already_done: Boolean(stock.already_done),
        items_source: stock.items_source || null,
      });
    } catch (e) {
      if (e?.code === 'no_sale_items') {
        return json(res, 200, {
          ok: true,
          status: 'cancelada',
          venda_id: vendaId,
          cancelada_em: venda.cancelada_em || null,
          cancel_motivo: venda.cancel_motivo || motivo,
          refund_total: 0,
          items: [],
          stock_restored: false,
          stock_warning: 'no_sale_items',
        });
      }
      console.error('[salesCancel] stock repair:', e);
      return json(res, 500, {
        ok: false,
        error: 'stock_revert_failed',
        detail: String(e?.message || e),
        partial_failure: true,
      });
    }
  }

  // `cancelling` = falha parcial anterior (ex.: estoque); permite retomar.
  if (statusNow !== 'cancelling' && !CANCELLABLE.has(statusNow)) {
    return json(res, 400, { ok: false, error: 'invalid_status' });
  }

  const previousStatus = statusNow === 'cancelling' ? null : statusNow;

  if (statusNow !== 'cancelling') {
    try {
      await updateDocumentResilient(databases, DB_ID, SALES_COL, vendaId, {
        status: 'cancelling',
        ...(idempotencyKey ? { cancel_idempotency_key: idempotencyKey } : {}),
      });
    } catch (e) {
      console.error('[salesCancel] cancelling patch:', e);
      return json(res, 500, { ok: false, error: 'server_error' });
    }
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
    if (previousStatus) {
      try {
        await updateDocumentResilient(databases, DB_ID, SALES_COL, vendaId, {
          status: previousStatus,
          cancel_idempotency_key: '',
        });
      } catch {
        void 0;
      }
    }
    return json(res, 500, {
      ok: false,
      error: 'financial_refund_failed',
      detail: String(e?.message || e),
    });
  }

  let revertedItems = [];
  let itemsSource = null;
  try {
    const stock = await ensureSaleCancelStockRestored(databases, {
      dbId: DB_ID,
      vendaId,
      venda,
      academyId: vendaAcademyId,
      motivo,
      usuarioId,
      usuarioName,
    });
    revertedItems = stock.items || [];
    itemsSource = stock.items_source || (stock.already_done ? 'moves' : null);
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
      status_before: previousStatus || 'cancelling',
      items_count: revertedItems.length,
      items_source: itemsSource,
    },
  }).catch((e) => console.warn('[salesCancel] audit:', e?.message || e));

  console.log(
    JSON.stringify({
      level: 'info',
      action: 'sales_cancel',
      venda_id: vendaId,
      academy_id: vendaAcademyId,
      refund_total,
      items_count: revertedItems.length,
      items_source: itemsSource,
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
    items_source: itemsSource,
  });
}
