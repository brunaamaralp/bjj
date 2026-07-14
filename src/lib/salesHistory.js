import { channelLabel, DEFAULT_CANCEL_RECEIPT_TEMPLATE } from './salesSettings.js';
import {
  formatSalePaymentHistoryLabel,
  salePaidAmountNet,
  saleRemainingAmount,
} from './salePayments.js';
import { formatBRL } from './moneyBr.js';
import { productDisplayLabel } from './stockProducts.js';


export { DEFAULT_CANCEL_RECEIPT_TEMPLATE } from './salesSettings.js';

export const CANCEL_REASON_OPTIONS = [
  { value: 'desistencia', label: 'Desistência do cliente' },
  { value: 'defeito', label: 'Produto com defeito' },
  { value: 'erro', label: 'Erro na venda' },
  { value: 'outro', label: 'Outro' },
];

export function formatSaleIdShort(id) {
  const s = String(id || '').trim();
  if (s.length < 4) return s ? `#${s.toUpperCase()}` : '—';
  return `#${s.slice(-4).toUpperCase()}`;
}

export function defaultPeriodRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: toDateInput(from),
    to: toDateInput(to),
  };
}

export function toDateInput(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parsePeriodBounds(fromStr, toStr) {
  const from = fromStr ? new Date(`${fromStr}T00:00:00`) : null;
  const to = toStr ? new Date(`${toStr}T23:59:59.999`) : null;
  return { from, to };
}

export function saleInPeriod(sale, from, to) {
  const raw = sale.cancelada_em || sale.created_at || sale.$createdAt || '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return true;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function resolveClientName(sale, leadNames = {}) {
  if (sale.cliente_nome) return String(sale.cliente_nome).trim();
  if (sale.aluno_id && leadNames[sale.aluno_id]) return leadNames[sale.aluno_id];
  return 'Cliente avulso';
}

export function formatItemsSummary(items, firstLabel) {
  const list = items || [];
  if (!list.length) return '—';
  const label = firstLabel || list[0]?.display_label || 'Item';
  if (list.length === 1) return label;
  return `${label} + ${list.length - 1} outro${list.length - 1 > 1 ? 's' : ''}`;
}

/** Resumo de itens a partir do snapshot gravado na venda (evita N+1 na listagem). */
export function itemsSummaryFromSnapshot(doc) {
  try {
    const raw = doc?.itens_snapshot_json;
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!Array.isArray(snap) || !snap.length) return null;
    const first = String(snap[0]?.label || '').trim() || 'Item';
    if (snap.length === 1) return first;
    const rest = snap.length - 1;
    return `${first} + ${rest} outro${rest > 1 ? 's' : ''}`;
  } catch {
    return null;
  }
}

function resolveSalePaidAmount(sale) {
  const fromField = Number(sale?.paid_amount);
  if (Number.isFinite(fromField) && fromField >= 0) return fromField;
  return salePaidAmountNet(sale?.pagamentos ?? sale?.pagamentos_json);
}

function resolveSaleRemaining(sale) {
  const fromField = Number(sale?.remaining_amount);
  if (Number.isFinite(fromField) && fromField >= 0) return fromField;
  const total = Number(sale?.total) || 0;
  return saleRemainingAmount(total, resolveSalePaidAmount(sale));
}

export function computeHistoryTotals(sales) {
  let concludedCount = 0;
  let concludedReceived = 0;
  let openCount = 0;
  let openRemaining = 0;
  let cancelCount = 0;
  for (const s of sales || []) {
    const st = String(s.status || '').toLowerCase();
    const total = Number(s.total) || 0;
    const paid = resolveSalePaidAmount(s);
    if (st === 'concluida') {
      concludedCount += 1;
      concludedReceived += paid > 0.009 ? paid : total;
    } else if (st === 'pendente' || st === 'parcial') {
      openCount += 1;
      openRemaining += resolveSaleRemaining(s);
    } else if (st === 'cancelada') {
      cancelCount += 1;
    }
  }
  return {
    concludedCount,
    concludedReceived,
    /** @deprecated use concludedReceived */
    concludedTotal: concludedReceived,
    openCount,
    openRemaining,
    cancelCount,
  };
}

/** Estorno estimado ao cancelar (valor já recebido / liquidado). */
export function estimateCancelRefund(sale) {
  return resolveSalePaidAmount(sale);
}

export function saleIsPartiallyPaid(sale) {
  const st = String(sale?.status || '').toLowerCase();
  if (st === 'parcial') return true;
  if (st === 'pendente') return false;
  const total = Number(sale?.total) || 0;
  const paid = resolveSalePaidAmount(sale);
  return paid > 0.009 && paid < total - 0.009;
}

export function filterSalesList(sales, { status, canal, search }) {
  const q = String(search || '').trim().toLowerCase();
  return (sales || []).filter((s) => {
    const st = String(s.status || '').toLowerCase();
    if (status === 'concluida' && st !== 'concluida') return false;
    if (status === 'cancelada' && st !== 'cancelada') return false;
    if (status === 'pendente' && st !== 'pendente') return false;
    if (status === 'parcial' && st !== 'parcial') return false;
    if (status === 'rascunho' && st !== 'rascunho') return false;
    if (status === 'em_aberto' && st !== 'pendente' && st !== 'parcial' && st !== 'cancelling') return false;
    if (canal && canal !== 'all' && String(s.canal || 'presencial') !== canal) return false;
    if (q) {
      const hay = [
        s.id,
        s.client_name,
        formatSaleIdShort(s.id),
        s.items_summary,
        s.payment_label,
        s.forma_pagamento,
        saleStatusLabel(s.status),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function mapSaleListRow(sale) {
  return {
    id: sale.id,
    created_at: sale.created_at,
    id_short: formatSaleIdShort(sale.id),
    client_name: sale.client_name,
    canal: sale.canal,
    canal_label: channelLabel(sale.canal),
    items_summary: sale.items_summary,
    total: sale.total,
    total_label: formatBRL(sale.total),
    forma_pagamento: sale.forma_pagamento,
    payment_label: formatSalePaymentHistoryLabel(sale),
    status: sale.status,
    is_cancelled: String(sale.status).toLowerCase() === 'cancelada',
  };
}

export function buildCancelReceiptText({
  template,
  footer,
  academyName,
  saleId,
  cancelDate,
  cancelReason,
  items,
  refundTotal,
}) {
  const itemsLines = (items || [])
    .map((it) => `• ${it.quantidade}x ${it.display_label}`)
    .join('\n');
  const vars = {
    academy_name: String(academyName || 'Academia').trim(),
    sale_id: formatSaleIdShort(saleId),
    cancel_date: String(cancelDate || '').trim(),
    cancel_reason: String(cancelReason || '').trim(),
    items_lines: itemsLines || '—',
    refund_total: formatBRL(refundTotal),
    footer: String(footer || '').trim(),
  };
  let out = String(template || DEFAULT_CANCEL_RECEIPT_TEMPLATE);
  for (const [key, val] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  return out.trim();
}

export function stockItemLabel(doc) {
  return productDisplayLabel(doc);
}

export function formatDateTimeBr(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCancelMotivo(categoria, textoLivre) {
  if (categoria === 'outro') return String(textoLivre || '').trim();
  const opt = CANCEL_REASON_OPTIONS.find((o) => o.value === categoria);
  return opt?.label || String(categoria || '').trim() || String(textoLivre || '').trim();
}

export function saleStatusLabel(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'cancelada') return 'Cancelada';
  if (st === 'cancelling') return 'Cancelando…';
  if (st === 'concluida') return 'Concluída';
  if (st === 'parcial') return 'Parcial';
  if (st === 'pendente') return 'Pendente';
  if (st === 'rascunho') return 'Rascunho';
  return status || '—';
}

export const SALE_STATUS_BADGE_MAP = {
  concluida: { label: 'Concluída', tone: 'success' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
  cancelling: { label: 'Cancelando…', tone: 'warning' },
  pendente: { label: 'Pendente', tone: 'warning' },
  parcial: { label: 'Parcial', tone: 'warning' },
  rascunho: { label: 'Rascunho', tone: 'muted' },
};

export function saleIsDraft(statusOrSale) {
  const st =
    statusOrSale != null && typeof statusOrSale === 'object'
      ? String(statusOrSale.status || '').toLowerCase()
      : String(statusOrSale || '').toLowerCase();
  return st === 'rascunho';
}

/** Rascunhos incompletos — descarte sem motivo de cancelamento. */
export function saleAllowsDiscardDraft(statusOrSale) {
  return saleIsDraft(statusOrSale);
}

/** Vendas em que owner/admin pode cancelar ou trocar produto (histórico / detalhe). */
export function saleAllowsCancelOrEdit(statusOrSale) {
  const sale =
    statusOrSale != null && typeof statusOrSale === 'object'
      ? statusOrSale
      : { status: statusOrSale };
  const st = String(sale.status || '').toLowerCase();
  if (st === 'cancelada' || st === 'rascunho') return false;
  // `cancelling` = falha parcial; permite retomar e devolver estoque.
  if (st === 'concluida' || st === 'pendente' || st === 'parcial' || st === 'cancelling') return true;
  if (sale.deferred === true) return true;
  return false;
}

/**
 * Venda já cancelada — permite re-chamar cancelar para estornar estoque
 * se o cancelamento financeiro passou e o estoque falhou (ou ficou sem movimento).
 */
export function saleAllowsStockRepair(statusOrSale) {
  const st =
    statusOrSale != null && typeof statusOrSale === 'object'
      ? String(statusOrSale.status || '').toLowerCase()
      : String(statusOrSale || '').toLowerCase();
  return st === 'cancelada';
}

/** Cancelamento interrompido — botão deve concluir em vez de iniciar de novo. */
export function saleIsCancelInProgress(statusOrSale) {
  const st =
    statusOrSale != null && typeof statusOrSale === 'object'
      ? String(statusOrSale.status || '').toLowerCase()
      : String(statusOrSale || '').toLowerCase();
  return st === 'cancelling';
}

/** @deprecated Use StatusBadge + SALE_STATUS_BADGE_MAP */
export function saleStatusBadgeClass(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'cancelada') return 'sales-badge sales-badge--danger';
  if (st === 'pendente' || st === 'parcial') return 'sales-badge sales-badge--pending';
  return 'sales-badge sales-badge--ok';
}
