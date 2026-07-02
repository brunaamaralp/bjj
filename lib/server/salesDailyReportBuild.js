/**
 * Montagem do payload do relatório diário de vendas / fechamento recepção (pure helpers + testáveis).
 */
import { aggregatePaymentTotalsFromSaleDocs } from './salePaymentTotals.js';
import {
  aggregatePaymentTotalsFromPaymentDocs,
  mergePaymentTotals,
} from './dailyReportStudentPayments.js';

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/** @param {string} dateYmd */
export function parseReportDateYmd(dateYmd) {
  const s = String(dateYmd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return s;
}

/**
 * @param {object[]} mappedSales — vendas já mapeadas (mapSaleDoc + operator_name)
 */
export function buildDailyReportSummary(mappedSales, mappedPayments = []) {
  let concludedCount = 0;
  let concludedTotal = 0;
  let cancelCount = 0;
  let pendingCount = 0;
  let pendingTotal = 0;

  for (const s of mappedSales || []) {
    const st = String(s?.status || '').toLowerCase();
    const total = Number(s?.total) || 0;
    if (st === 'concluida') {
      concludedCount += 1;
      concludedTotal += total;
    } else if (st === 'cancelada') {
      cancelCount += 1;
    } else if (st === 'pendente' || s?.deferred === true) {
      pendingCount += 1;
      pendingTotal += total;
    }
  }

  let paymentsCount = 0;
  let paymentsTotal = 0;
  for (const p of mappedPayments || []) {
    const amount = Number(p?.amount) || 0;
    if (amount <= 0) continue;
    paymentsCount += 1;
    paymentsTotal += amount;
  }

  concludedTotal = roundMoney(concludedTotal);
  pendingTotal = roundMoney(pendingTotal);
  paymentsTotal = roundMoney(paymentsTotal);
  const ticketMedio =
    concludedCount > 0 ? roundMoney(concludedTotal / concludedCount) : 0;
  const receptionTotal = roundMoney(concludedTotal + paymentsTotal);

  return {
    concluded_count: concludedCount,
    concluded_total: concludedTotal,
    ticket_medio: ticketMedio,
    cancel_count: cancelCount,
    pending_count: pendingCount,
    pending_total: pendingTotal,
    payments_count: paymentsCount,
    payments_total: paymentsTotal,
    reception_total: receptionTotal,
  };
}

function sortByCreatedAt(a, b) {
  const ta = new Date(a?.created_at || 0).getTime();
  const tb = new Date(b?.created_at || 0).getTime();
  return ta - tb;
}

function sortByPaidAt(a, b) {
  const ta = new Date(a?.paid_at || 0).getTime();
  const tb = new Date(b?.paid_at || 0).getTime();
  return ta - tb;
}

/**
 * @param {object} params
 * @param {string} params.dateYmd
 * @param {string} params.academyName
 * @param {object[]} params.mappedSales
 * @param {object[]} params.rawSaleDocs — docs Appwrite (para agregação pagamento)
 * @param {object[]} [params.mappedPayments]
 * @param {object[]} [params.rawPaymentDocs]
 * @param {boolean} [params.truncated]
 * @param {boolean} [params.payments_truncated]
 */
export function buildDailyReportPayload({
  dateYmd,
  academyName,
  mappedSales,
  rawSaleDocs,
  mappedPayments = [],
  rawPaymentDocs = [],
  truncated = false,
  payments_truncated = false,
}) {
  const summary = buildDailyReportSummary(mappedSales, mappedPayments);
  const salesTotals = aggregatePaymentTotalsFromSaleDocs(rawSaleDocs, {
    statusFilter: 'concluida',
  });
  const paymentTotals = aggregatePaymentTotalsFromPaymentDocs(rawPaymentDocs);
  const totals_by_payment = mergePaymentTotals(salesTotals, paymentTotals);

  const concluded = mappedSales
    .filter((s) => String(s.status || '').toLowerCase() === 'concluida')
    .sort(sortByCreatedAt);

  const cancelled = mappedSales
    .filter((s) => String(s.status || '').toLowerCase() === 'cancelada')
    .sort(sortByCreatedAt);

  const pending = mappedSales
    .filter((s) => {
      const st = String(s.status || '').toLowerCase();
      return st === 'pendente' || s.deferred === true;
    })
    .sort(sortByCreatedAt);

  const payments_received = [...(mappedPayments || [])].sort(sortByPaidAt);

  return {
    ok: true,
    date: dateYmd,
    academy_name: String(academyName || '').trim() || 'Academia',
    generated_at: new Date().toISOString(),
    summary,
    totals_by_payment,
    totals_by_payment_sales: salesTotals,
    totals_by_payment_payments: paymentTotals,
    sales_concluded: concluded,
    sales_cancelled: cancelled,
    sales_pending: pending,
    payments_received,
    truncated: truncated === true,
    payments_truncated: payments_truncated === true,
  };
}
