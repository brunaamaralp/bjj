import { downloadCsv } from './reportsExport.js';
import { formatBRL } from './moneyBr.js';
import { formatSaleIdShort, toDateInput } from './salesHistory.js';
import { paymentFormLabel } from './salePayments.js';
import { formatPaymentIdShort } from '../../lib/receipts/paymentReceiptText.js';

function formatDateBrYmd(dateYmd) {
  const s = String(dateYmd || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

function formatTimeBr(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatItemsLine(items) {
  const list = items || [];
  if (!list.length) return '—';
  return list
    .map((it) => {
      const qty = Number(it.quantidade) || 1;
      const label = it.display_label || it.label || 'Item';
      return qty > 1 ? `${qty}x ${label}` : label;
    })
    .join(', ');
}

function line(label, value) {
  return `${label} ${'.'.repeat(Math.max(1, 28 - label.length))} ${value}`;
}

function appendSaleLines(lines, title, sales) {
  if (!sales?.length) return;
  lines.push('');
  lines.push(title);
  for (const s of sales) {
    const time = formatTimeBr(s.created_at);
    const id = formatSaleIdShort(s.id);
    const client = s.client_name || 'Cliente avulso';
    const items = s.items_summary || formatItemsLine(s.items);
    const pay = s.payment_label || '—';
    const op = s.operator_name ? ` · ${s.operator_name}` : '';
    lines.push(`${time} ${id} · ${client} · ${items} · ${formatBRL(s.total)} · ${pay}${op}`);
  }
}

function appendPaymentLines(lines, title, payments) {
  if (!payments?.length) return;
  lines.push('');
  lines.push(title);
  for (const p of payments) {
    const time = formatTimeBr(p.paid_at);
    const id = formatPaymentIdShort(p.id);
    const student = p.student_name || 'Aluno';
    const ref = p.reference_month ? ` · ref. ${p.reference_month}` : '';
    const pay = p.payment_label || '—';
    const op = p.registered_by ? ` · ${p.registered_by}` : '';
    lines.push(`${time} ${id} · ${student}${ref} · ${formatBRL(p.amount)} · ${pay}${op}`);
  }
}

/**
 * Data do relatório: dia único do filtro ou hoje.
 * @param {{ from?: string, to?: string }} period
 */
export function resolveDailyReportDateYmd(period) {
  const from = String(period?.from || '').trim();
  const to = String(period?.to || '').trim();
  if (from && from === to && /^\d{4}-\d{2}-\d{2}$/.test(from)) return from;
  return toDateInput(new Date());
}

export function dailyReportFilename(dateYmd) {
  const d = String(dateYmd || '').slice(0, 10) || 'dia';
  return `fechamento-dia-${d}.csv`;
}

/** @param {object} report — payload do daily_report API */
export function buildDailyReportText(report) {
  if (!report) return '';
  const s = report.summary || {};
  const lines = [
    '══════════════════════════════════════',
    `  FECHAMENTO DO DIA — ${report.academy_name || 'Academia'}`,
    `  ${formatDateBrYmd(report.date)}`,
    '══════════════════════════════════════',
    '',
    'RESUMO',
    line('Vendas concluídas', `${s.concluded_count || 0} (${formatBRL(s.concluded_total)})`),
    line('Mensalidades recebidas', `${s.payments_count || 0} (${formatBRL(s.payments_total)})`),
    line('Total recepção', formatBRL(s.reception_total)),
    line('Ticket médio (vendas)', formatBRL(s.ticket_medio)),
    line('Cancelamentos', String(s.cancel_count || 0)),
  ];

  if (Number(s.pending_count) > 0) {
    lines.push(line('A receber', `${s.pending_count} (${formatBRL(s.pending_total)})`));
  }

  const payments = report.totals_by_payment || {};
  const paymentKeys = Object.keys(payments).filter((k) => Number(payments[k]) !== 0);
  if (paymentKeys.length) {
    lines.push('');
    lines.push('POR FORMA DE PAGAMENTO');
    for (const key of paymentKeys.sort()) {
      lines.push(line(paymentFormLabel(key), formatBRL(payments[key])));
    }
  }

  appendSaleLines(lines, 'VENDAS CONCLUÍDAS', report.sales_concluded);
  appendPaymentLines(lines, 'MENSALIDADES RECEBIDAS', report.payments_received);
  appendSaleLines(lines, 'CANCELADAS', report.sales_cancelled);
  appendSaleLines(lines, 'A RECEBER', report.sales_pending);

  if (report.truncated || report.payments_truncated) {
    lines.push('');
    lines.push('⚠ Lista truncada — muitos registros no dia. Exporte CSV para detalhes completos.');
  }

  lines.push('');
  lines.push('Dados em tempo real — cancelamentos posteriores alteram o resumo.');
  return lines.join('\n').trim();
}

function paymentToCsvRow(payment) {
  return {
    tipo: 'mensalidade',
    data: String(payment.paid_at || '').slice(0, 10),
    hora: formatTimeBr(payment.paid_at),
    pagamento_id: payment.id || '',
    id_curto: formatPaymentIdShort(payment.id),
    cliente: payment.student_name || '',
    itens: payment.category_label || 'Mensalidade',
    referencia: payment.reference_month || '',
    total: payment.amount ?? '',
    pagamento: payment.payment_label || '',
    status: payment.status || '',
    operador: payment.registered_by || '',
  };
}

function saleToCsvRow(sale, statusLabel) {
  return {
    tipo: 'venda',
    data: String(reportDateFromSale(sale) || ''),
    hora: formatTimeBr(sale.created_at),
    venda_id: sale.id || '',
    id_curto: formatSaleIdShort(sale.id),
    cliente: sale.client_name || '',
    itens: sale.items_summary || formatItemsLine(sale.items),
    total: sale.total ?? '',
    pagamento: sale.payment_label || '',
    status: statusLabel,
    operador: sale.operator_name || '',
  };
}

function reportDateFromSale(sale) {
  const iso = sale.created_at;
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

/** @param {object} report */
export function buildDailyReportCsvRows(report) {
  if (!report) return [{ mensagem: 'Nenhum dado' }];
  const s = report.summary || {};
  const rows = [
    { tipo: 'resumo', metrica: 'Data', valor: report.date || '' },
    { tipo: 'resumo', metrica: 'Academia', valor: report.academy_name || '' },
    { tipo: 'resumo', metrica: 'Vendas concluídas (qtd)', valor: s.concluded_count ?? 0 },
    { tipo: 'resumo', metrica: 'Vendas concluídas (R$)', valor: s.concluded_total ?? 0 },
    { tipo: 'resumo', metrica: 'Ticket médio', valor: s.ticket_medio ?? 0 },
    { tipo: 'resumo', metrica: 'Cancelamentos', valor: s.cancel_count ?? 0 },
    { tipo: 'resumo', metrica: 'A receber (qtd)', valor: s.pending_count ?? 0 },
    { tipo: 'resumo', metrica: 'A receber (R$)', valor: s.pending_total ?? 0 },
    { tipo: 'resumo', metrica: 'Mensalidades (qtd)', valor: s.payments_count ?? 0 },
    { tipo: 'resumo', metrica: 'Mensalidades (R$)', valor: s.payments_total ?? 0 },
    { tipo: 'resumo', metrica: 'Total recepção (R$)', valor: s.reception_total ?? 0 },
  ];

  for (const [forma, val] of Object.entries(report.totals_by_payment || {})) {
    rows.push({
      tipo: 'resumo',
      metrica: `Forma — ${paymentFormLabel(forma)}`,
      valor: val,
    });
  }

  for (const sale of report.sales_concluded || []) {
    rows.push(saleToCsvRow(sale, 'concluida'));
  }
  for (const payment of report.payments_received || []) {
    rows.push(paymentToCsvRow(payment));
  }
  for (const sale of report.sales_cancelled || []) {
    rows.push(saleToCsvRow(sale, 'cancelada'));
  }
  for (const sale of report.sales_pending || []) {
    rows.push(saleToCsvRow(sale, 'pendente'));
  }

  return rows;
}

/** @param {object} report */
export function exportSalesDailyReportCsv(report) {
  const rows = buildDailyReportCsvRows(report);
  downloadCsv(rows, dailyReportFilename(report?.date));
}
