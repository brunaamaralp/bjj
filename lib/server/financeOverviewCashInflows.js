/**
 * Entradas de caixa na Visão Geral: TX liquidadas + recebimentos espelhados pendentes
 * + mensalidades/vendas recebidas sem espelho no período.
 */
import { roundMoney } from '../money.js';
import { txDirection } from './financeTxFields.js';
import { operationalBucketForTx } from '../../src/lib/financeCategories.js';
import { mirrorGrossForPayment } from '../../src/lib/paymentStatus.js';
import { aggregatePaymentTotalsFromSaleDocs } from './salePaymentTotals.js';

export function buildMirrorCoverageIndex(txItems) {
  const byPayment = new Set();
  const bySale = new Set();
  for (const tx of txItems || []) {
    const st = String(tx?.status || '').toLowerCase();
    if (st === 'cancelled') continue;
    const origin = String(tx?.origin_type || '').toLowerCase();
    const originId = String(tx?.origin_id || '').trim();
    if (origin === 'student_payment' && originId) byPayment.add(originId);
    if (origin === 'sale' && originId) bySale.add(originId);
    const saleId = String(tx?.saleId || '').trim();
    if (saleId) bySale.add(saleId);
  }
  return { byPayment, bySale };
}

/** Pendências de pagamento/venda já recebidas (ex.: cartão aguardando liquidação). */
export function pendingInFromReceivedOrigins(txItems) {
  let total = 0;
  for (const tx of txItems || []) {
    if (String(tx?.status || '').toLowerCase() !== 'pending') continue;
    if (operationalBucketForTx(tx) === 'neutral') continue;
    if (txDirection(tx) !== 'in') continue;
    const origin = String(tx?.origin_type || '').toLowerCase();
    if (origin !== 'student_payment' && origin !== 'sale') continue;
    total += Math.abs(Number(tx?.gross) || 0);
  }
  return roundMoney(total);
}

function saleReceivedTotal(sale) {
  const totals = aggregatePaymentTotalsFromSaleDocs([sale], { statusFilter: 'concluida' });
  return Object.values(totals).reduce((sum, value) => sum + Number(value || 0), 0);
}

function supplementalFromPayments(payments, coverage) {
  let total = 0;
  for (const payment of payments || []) {
    const paymentId = String(payment?.$id || payment?.id || '').trim();
    if (!paymentId || coverage.byPayment.has(paymentId)) continue;
    const amount = mirrorGrossForPayment(
      payment.status,
      payment.paid_amount,
      payment.expected_amount ?? payment.amount
    );
    if (amount > 0) total += amount;
  }
  return roundMoney(total);
}

function supplementalFromSales(sales, coverage) {
  let total = 0;
  for (const sale of sales || []) {
    if (String(sale?.status || '').toLowerCase() !== 'concluida') continue;
    const saleId = String(sale?.$id || sale?.id || '').trim();
    if (!saleId || coverage.bySale.has(saleId)) continue;
    const amount = saleReceivedTotal(sale);
    if (amount > 0) total += amount;
  }
  return roundMoney(total);
}

/**
 * Ajusta settledIn / periodBalance para refletir recebimentos operacionais do período.
 * @param {object} summary — aggregatePeriodSummary
 * @param {object[]} txItems — TX do período (mapeadas)
 * @param {{ payments?: object[], sales?: object[] }} extras
 */
export function enrichOverviewPeriodSummary(summary, txItems, extras = {}) {
  const base = summary || {};
  const coverage = buildMirrorCoverageIndex(txItems);
  const supplementalInflow = roundMoney(
    supplementalFromPayments(extras.payments, coverage) +
      supplementalFromSales(extras.sales, coverage)
  );
  const pendingReceivedInflow = pendingInFromReceivedOrigins(txItems);
  const settledIn = roundMoney(
    Number(base.settledIn || 0) + supplementalInflow + pendingReceivedInflow
  );
  const settledOut = roundMoney(Number(base.settledOut || 0));

  return {
    ...base,
    settledIn,
    periodBalance: roundMoney(settledIn - settledOut),
    supplementalInflow,
    pendingReceivedInflow,
  };
}
