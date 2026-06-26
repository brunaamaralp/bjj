/**
 * Agregação unificada de contas a receber (mensalidades, lançamentos pendentes, vendas a prazo).
 */
import { isActiveStudent } from './studentStatus.js';
import { effectiveStudentPlan } from './financeStudentRoster.js';
import {
  expectedAmountForStudent,
  receivedAmountForPayment,
} from './paymentStatus.js';
import { getPaymentRowStatus } from './collectionOverdue.js';
import { txDirection } from './financeTxDisplay.js';

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

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
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

/**
 * @param {object} params
 * @returns {Array<object>}
 */
export function buildMensalidadeReceivableItems({
  students = [],
  payments = [],
  financeConfig = {},
  referenceMonth,
  today = new Date(),
}) {
  const active = students.filter((s) => isActiveStudent(s));
  const payByLead = {};
  for (const p of payments) {
    const lid = String(p.lead_id || '').trim();
    if (!lid) continue;
    payByLead[lid] = p;
  }

  const items = [];
  for (const s of active) {
    const p = payByLead[s.id];
    if (!effectiveStudentPlan(s, p)) continue;
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
    const st = String(tx?.status || '').toLowerCase();
    if (st !== 'pending') continue;

    const dir = txDirection(tx);
    const type = String(tx?.type || '').toLowerCase();
    if (dir === 'out' || type === 'expense') continue;

    const amount = roundMoney(Math.abs(Number(tx.gross) || 0));
    if (amount < 0.01) continue;

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
  financeConfig,
  referenceMonth,
  pendingTransactions,
  deferredSales,
  today,
}) {
  const mensalidadeItems = buildMensalidadeReceivableItems({
    students,
    payments,
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
