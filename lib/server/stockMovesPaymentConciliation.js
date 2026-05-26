/**
 * Cruza payment_status_at_move (snapshot STOCK_MOVES) com estado atual da venda.
 */
import { normalizePagamentosInput, sumPagamentosNet, roundMoney } from './salePayments.js';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';

const VENDA_TYPE = FINANCE_CATEGORIES.VENDA_PRODUTO.type;

/** Snapshot na saída: paid | partial | pending → eixo de comparação */
export function normalizeSnapshotStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'paid') return 'settled';
  if (s === 'partial') return 'partial';
  if (s === 'pending') return 'pending';
  return s || 'pending';
}

/** Estado atual derivado de SALES + FINANCIAL_TX (saleId). */
export function deriveStatusAtualVenda(saleDoc, financeTxDocs = []) {
  if (!saleDoc) return 'pending';

  const saleStatus = String(saleDoc.status || '').toLowerCase();
  if (saleStatus === 'cancelada') return 'cancelled';

  const productTxs = (financeTxDocs || []).filter(
    (t) => String(t.saleId || '') === String(saleDoc.$id || '') && String(t.type || '') === VENDA_TYPE
  );

  if (productTxs.length) {
    const statuses = productTxs.map((t) => String(t.status || '').toLowerCase());
    if (statuses.some((s) => s === 'cancelled')) return 'cancelled';
    if (statuses.every((s) => s === 'settled' || s === 'paid')) return 'settled';
    if (statuses.some((s) => s === 'partial')) return 'partial';
    return 'pending';
  }

  if (saleStatus === 'concluida') {
    let pagamentosNorm = [];
    if (saleDoc.pagamentos_json) {
      try {
        pagamentosNorm = normalizePagamentosInput(JSON.parse(saleDoc.pagamentos_json));
      } catch {
        pagamentosNorm = [];
      }
    }
    const total = roundMoney(Number(saleDoc.total) || 0);
    if (!pagamentosNorm.length) return 'settled';
    const net = sumPagamentosNet(pagamentosNorm);
    if (net >= total - 0.009) return 'settled';
    if (net > 0.009) return 'partial';
    return 'pending';
  }

  return 'pending';
}

/**
 * @returns {'ok'|'divergent'|'settled_after'|'cancelled_after'|'reversed'}
 */
export function comparePaymentConciliation(paymentStatusAtMove, statusAtualVenda) {
  const snap = normalizeSnapshotStatus(paymentStatusAtMove);
  const atual = String(statusAtualVenda || '').toLowerCase();

  if (atual === 'cancelled') {
    if (snap === 'settled') return 'reversed';
    if (snap === 'pending' || snap === 'partial') return 'cancelled_after';
    return 'divergent';
  }

  if ((snap === 'pending' || snap === 'partial') && atual === 'settled') {
    return 'settled_after';
  }

  if (snap === atual) return 'ok';
  if (snap === 'settled' && atual === 'settled') return 'ok';
  if (snap === 'partial' && atual === 'partial') return 'ok';
  if (snap === 'pending' && atual === 'pending') return 'ok';

  return 'divergent';
}

export const CONCILIATION_STATUS_LABELS = {
  ok: 'OK',
  divergent: 'Divergente',
  settled_after: 'Quitado depois',
  cancelled_after: 'Cancelado depois',
  reversed: 'Estorno / cancelada',
};

export const STATUS_ATUAL_LABELS = {
  cancelled: 'Cancelada',
  settled: 'Quitado',
  partial: 'Parcial',
  pending: 'Pendente',
};

export const SNAPSHOT_STATUS_LABELS = {
  settled: 'Pago (na saída)',
  paid: 'Pago (na saída)',
  partial: 'Parcial (na saída)',
  pending: 'Pendente (na saída)',
};

export function matchesStatusFilter(conciliationStatus, statusAtual, filter) {
  const f = String(filter || 'divergent').toLowerCase();
  if (f === 'all') return true;
  if (f === 'pending') return statusAtual === 'pending';
  if (f === 'settled') return statusAtual === 'settled';
  if (f === 'divergent') {
    return conciliationStatus !== 'ok';
  }
  return true;
}
