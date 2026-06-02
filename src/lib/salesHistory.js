import { channelLabel, paymentLabel } from './salesSettings.js';
import { formatSalePaymentHistoryLabel } from './salePayments.js';
import { formatBRL } from './moneyBr.js';
import { productDisplayLabel } from './stockProducts.js';

export const CANCEL_REASON_OPTIONS = [
  { value: 'desistencia', label: 'Desistência do cliente' },
  { value: 'defeito', label: 'Produto com defeito' },
  { value: 'erro', label: 'Erro na venda' },
  { value: 'outro', label: 'Outro' },
];

export const DEFAULT_CANCEL_RECEIPT_TEMPLATE = `*Cancelamento — {academy_name}*
Venda #{sale_id} cancelada em {cancel_date}

Motivo: {cancel_reason}

Itens devolvidos ao estoque:
{items_lines}

Valor estornado: {refund_total}

{footer}`;

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

export function computeHistoryTotals(sales) {
  let concludedCount = 0;
  let concludedTotal = 0;
  let cancelCount = 0;
  for (const s of sales || []) {
    const st = String(s.status || '').toLowerCase();
    const total = Number(s.total) || 0;
    if (st === 'concluida') {
      concludedCount += 1;
      concludedTotal += total;
    } else if (st === 'cancelada') {
      cancelCount += 1;
    }
  }
  return { concludedCount, concludedTotal, cancelCount };
}

export function filterSalesList(sales, { status, canal, search }) {
  const q = String(search || '').trim().toLowerCase();
  return (sales || []).filter((s) => {
    const st = String(s.status || '').toLowerCase();
    if (status === 'concluida' && st !== 'concluida') return false;
    if (status === 'cancelada' && st !== 'cancelada') return false;
    if (canal && canal !== 'all' && String(s.canal || 'presencial') !== canal) return false;
    if (q) {
      const hay = `${s.id} ${s.client_name} ${formatSaleIdShort(s.id)}`.toLowerCase();
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
  if (st === 'concluida') return 'Concluída';
  if (st === 'pendente') return 'Pendente';
  return status || '—';
}

export const SALE_STATUS_BADGE_MAP = {
  concluida: { label: 'Concluída', tone: 'success' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
  pendente: { label: 'Pendente', tone: 'warning' },
};

/** @deprecated Use StatusBadge + SALE_STATUS_BADGE_MAP */
export function saleStatusBadgeClass(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'cancelada') return 'sales-badge sales-badge--danger';
  if (st === 'pendente') return 'sales-badge sales-badge--pending';
  return 'sales-badge sales-badge--ok';
}
