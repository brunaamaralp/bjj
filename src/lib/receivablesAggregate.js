/**
 * Agregação unificada de contas a receber (mensalidades, lançamentos pendentes, vendas a prazo).
 */
import { isActiveStudent } from './studentStatus.js';
import {
  expectedAmountForStudent,
  receivedAmountForPayment,
} from './paymentStatus.js';
import { getPaymentRowStatus } from './collectionOverdue.js';
import { txDirection } from './financeTxDisplay.js';
import {
  buildPaidBundleCoveredMonthsByLead,
  isMonthCoveredByPaidBundle,
} from './bundleCoverage.js';
import { isAccrualLedgerTx } from './financeLedgerRegime.js';

export const RECEIVABLE_SOURCE = {
  MENSALIDADE: 'mensalidade',
  LANCAMENTO: 'lancamento',
  VENDA: 'venda',
};

export const RECEIVABLE_SOURCE_LABELS = {
  [RECEIVABLE_SOURCE.MENSALIDADE]: 'Mensalidade',
  [RECEIVABLE_SOURCE.LANCAMENTO]: 'Lançamento pendente',
  [RECEIVABLE_SOURCE.VENDA]: 'Venda a receber',
};

const STUDENT_PAYMENT_MIRROR_ORIGINS = new Set(['student_payment', 'student_payment_troco']);

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Entrada pendente que deve contar em A receber (não espelho de mensalidade / template / accrual).
 * Espelhos de student_payment já entram pela linha de mensalidade — contar de novo duplica.
 */
export function isReceivablePendingInflowTx(tx) {
  if (!tx) return false;
  const st = String(tx.status || '').toLowerCase();
  if (st !== 'pending') return false;
  if (tx.is_recurrence_template === true) return false;
  if (isAccrualLedgerTx(tx)) return false;
  const origin = String(tx.origin_type || tx.originType || '').toLowerCase();
  if (STUDENT_PAYMENT_MIRROR_ORIGINS.has(origin)) return false;
  const dir = txDirection(tx);
  const type = String(tx.type || '').toLowerCase();
  if (dir === 'out' || type === 'expense') return false;
  return Math.abs(Number(tx.gross) || 0) >= 0.01;
}

function ymdFromDate(d) {
  if (!d) return null;
  try {
    const x = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    return x.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/** Valor em aberto de mensalidade do mês (esperado − recebido). */
export function openMensalidadeAmount(student, payment, financeConfig) {
  if (!student) return 0;
  if (String(student?.freeze_status || student?.freezeStatus || '').trim() === 'active') return 0;
  const st = String(payment?.status || '').toLowerCase();
  if (['paid', 'covered', 'frozen', 'cancelled'].includes(st)) return 0;

  const expected = expectedAmountForStudent(student, financeConfig, payment);
  const received = receivedAmountForPayment(payment);
  return roundMoney(Math.max(0, expected - received));
}

/** Prioridade ao haver mais de um doc no mesmo lead/mês (ex.: pending + covered). */
export function paymentSettlementRank(payment) {
  const st = String(payment?.status || '').toLowerCase();
  if (st === 'covered' || st === 'paid' || st === 'frozen') return 4;
  if (st === 'partial') return 3;
  if (st === 'pending' || st === 'awaiting') return 2;
  if (st === 'cancelled') return 1;
  return 0;
}

/** Prefere quitado/coberto sobre pendente quando há duplicata. */
export function preferSettledPayment(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return paymentSettlementRank(b) > paymentSettlementRank(a) ? b : a;
}

/** @param {Array} payments */
export function indexPaymentsByLeadPreferSettled(payments = []) {
  const payByLead = {};
  for (const p of payments || []) {
    const lid = String(p?.lead_id || p?.leadId || '').trim();
    if (!lid) continue;
    payByLead[lid] = preferSettledPayment(payByLead[lid], p);
  }
  return payByLead;
}

/**
 * @param {object} params
 * @param {Array} [params.coveragePayments] — pagamentos extras (ex.: âncoras de pacote em outros meses)
 * @returns {Array<object>}
 */
export function buildMensalidadeReceivableItems({
  students = [],
  payments = [],
  coveragePayments = null,
  financeConfig = {},
  referenceMonth,
  today = new Date(),
}) {
  const active = students.filter((s) => isActiveStudent(s) && String(s.plan || '').trim());
  const payByLead = indexPaymentsByLeadPreferSettled(payments);

  // Âncoras + docs do mês (cobertos) — evita perder cobertura se a lista de âncoras veio incompleta.
  const coverageSource = Array.isArray(coveragePayments)
    ? [...coveragePayments, ...(payments || [])]
    : payments;
  const bundleCoveredByLead = buildPaidBundleCoveredMonthsByLead(coverageSource);

  const items = [];
  for (const s of active) {
    const leadId = String(s.id || s.$id || '').trim();
    if (isMonthCoveredByPaidBundle(referenceMonth, bundleCoveredByLead.get(leadId))) {
      continue;
    }

    const p = payByLead[s.id] || payByLead[leadId];
    const amount = openMensalidadeAmount(s, p, financeConfig);
    if (amount < 0.01) continue;

    const row = getPaymentRowStatus(s, p, referenceMonth, today);
    const dueDate =
      ymdFromDate(row.dueDate) ||
      (p?.due_date ? String(p.due_date).slice(0, 10) : null);

    const dbStatus = String(p?.status || '').toLowerCase();
    let status = dbStatus || 'open';
    if (row.status === 'pending' && row.daysOverdue >= 1) status = 'overdue';

    items.push({
      id: `mensalidade:${s.id}:${referenceMonth}`,
      source: RECEIVABLE_SOURCE.MENSALIDADE,
      sourceLabel: RECEIVABLE_SOURCE_LABELS[RECEIVABLE_SOURCE.MENSALIDADE],
      label: String(s.name || 'Aluno').trim() || 'Aluno',
      amount,
      due_date: dueDate,
      lead_id: s.id,
      reference_month: referenceMonth,
      status,
      linkTab: 'a-receber',
      linkSection: 'mensalidades',
    });
  }
  return items;
}

/** FINANCIAL_TX pendentes de entrada (não despesas). */
export function buildPendingTxReceivableItems(transactions = []) {
  const items = [];
  for (const tx of transactions) {
    if (!isReceivablePendingInflowTx(tx)) continue;

    const amount = roundMoney(Math.abs(Number(tx.gross) || 0));
    const txId = String(tx.id || tx.$id || '').trim();
    const cm = String(tx.competence_month || '').trim();
    const dueDate =
      (tx.due_date ? String(tx.due_date).slice(0, 10) : null) ||
      (/^\d{4}-\d{2}$/.test(cm) ? `${cm}-28` : null);

    items.push({
      id: `tx:${txId || amount}`,
      source: RECEIVABLE_SOURCE.LANCAMENTO,
      sourceLabel: RECEIVABLE_SOURCE_LABELS[RECEIVABLE_SOURCE.LANCAMENTO],
      label: String(tx.planName || tx.category || tx.note || 'Lançamento').trim() || 'Lançamento',
      amount,
      due_date: dueDate,
      lead_id: String(tx.lead_id || '').trim() || undefined,
      tx_id: txId || undefined,
      status: 'pending',
      linkTab: 'movimentacoes',
    });
  }
  return items;
}

/** Vendas adiadas ou com status pendente. */
export function buildDeferredSaleReceivableItems(sales = []) {
  const items = [];
  for (const sale of sales) {
    const st = String(sale?.status || '').toLowerCase();
    if (st === 'cancelada' || st === 'cancelled') continue;
    if (!(sale?.deferred === true || st === 'pendente')) continue;

    const amount = roundMoney(Number(sale.total) || 0);
    if (amount < 0.01) continue;

    const saleId = String(sale.$id || sale.id || '').trim();
    items.push({
      id: `sale:${saleId || amount}`,
      source: RECEIVABLE_SOURCE.VENDA,
      sourceLabel: RECEIVABLE_SOURCE_LABELS[RECEIVABLE_SOURCE.VENDA],
      label: String(sale.cliente_nome || sale.client_name || 'Venda de produtos').trim() || 'Venda de produtos',
      amount,
      due_date: sale.due_date ? String(sale.due_date).slice(0, 10) : null,
      lead_id: String(sale.aluno_id || sale.lead_id || '').trim() || undefined,
      sale_id: saleId || undefined,
      status: 'pending',
      linkTab: 'movimentacoes',
    });
  }
  return items;
}

export function mergeReceivableItems(...groups) {
  const rows = groups.flat().filter(Boolean);
  rows.sort((a, b) => {
    const da = String(a.due_date || '9999-99-99');
    const db = String(b.due_date || '9999-99-99');
    if (da !== db) return da.localeCompare(db);
    return String(a.label || '').localeCompare(String(b.label || ''), 'pt-BR');
  });
  return rows;
}

export function summarizeReceivables(items = []) {
  const bySource = {
    [RECEIVABLE_SOURCE.MENSALIDADE]: 0,
    [RECEIVABLE_SOURCE.LANCAMENTO]: 0,
    [RECEIVABLE_SOURCE.VENDA]: 0,
  };
  let total = 0;
  for (const it of items) {
    const amt = roundMoney(it.amount);
    total += amt;
    if (it.source in bySource) bySource[it.source] += amt;
  }
  for (const key of Object.keys(bySource)) {
    bySource[key] = roundMoney(bySource[key]);
  }
  return {
    total: roundMoney(total),
    bySource,
    count: items.length,
  };
}

export function buildReceivablesSnapshot({
  students,
  payments,
  coveragePayments = null,
  financeConfig,
  referenceMonth,
  pendingTransactions,
  deferredSales,
  today,
}) {
  const mensalidadeItems = buildMensalidadeReceivableItems({
    students,
    payments,
    coveragePayments,
    financeConfig,
    referenceMonth,
    today,
  });
  const txItems = buildPendingTxReceivableItems(pendingTransactions);
  const saleItems = buildDeferredSaleReceivableItems(deferredSales);
  const items = mergeReceivableItems(mensalidadeItems, txItems, saleItems);
  const summary = summarizeReceivables(items);
  return { items, summary, referenceMonth };
}
