/**
 * Sugestões de mensalidades pendentes para linhas órfãs do extrato (conciliação P1).
 */
import { Query } from 'node-appwrite';
import { DB_ID, STUDENT_PAYMENTS_COL } from './appwriteCollections.js';
import { scorePayerNameMatch } from './bankStatementPayerName.js';
import { loadPayerContextByLeadIds } from './studentPayerContext.js';
import { roundMoney } from '../money.js';

const PENDING_STATUSES = new Set(['pending', 'awaiting']);
const AMOUNT_TOLERANCE = 0.02;
const MAX_HINTS_PER_ITEM = 5;

function referenceMonthFromItemDate(itemDate, statementPeriod = {}) {
  const d = String(itemDate || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(0, 7);
  const start = String(statementPeriod.period_start || '').trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(start)) return start;
  const end = String(statementPeriod.period_end || '').trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(end)) return end;
  return null;
}

function amountsClose(a, b) {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= AMOUNT_TOLERANCE;
}

function paymentExpectedAmount(doc) {
  const expected = Number(doc.expected_amount);
  if (Number.isFinite(expected) && expected > 0) return expected;
  const amount = Number(doc.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function isPendingPayment(doc) {
  return PENDING_STATUSES.has(String(doc?.status || '').toLowerCase());
}

function isCreditOrphanItem(item) {
  const status = String(item?.status || '').toLowerCase();
  if (status === 'matched' || status === 'ignored' || status === 'duplicate') return false;
  return String(item?.direction || '') === 'credit';
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {{ date?: string, amount?: number, direction?: string, description?: string, status?: string, id?: string }} item
 * @param {{ period_start?: string, period_end?: string }} statementPeriod
 * @param {Map<string, object>} [paymentsByMonth]
 * @param {Map<string, object>} [payerContextByLeadId]
 */
export function suggestPendingPaymentsForBankItem(
  item,
  statementPeriod,
  { paymentsByMonth = new Map(), payerContextByLeadId = new Map() } = {}
) {
  if (!isCreditOrphanItem(item)) return [];

  const ym = referenceMonthFromItemDate(item.date, statementPeriod);
  if (!ym) return [];

  const pool = paymentsByMonth.get(ym) || [];
  const amount = Number(item.amount);

  const ranked = pool
    .filter((p) => amountsClose(paymentExpectedAmount(p), amount))
    .map((p) => {
      const leadId = String(p.lead_id || '').trim();
      const ctx = payerContextByLeadId.get(leadId);
      const leadName = String(ctx?.lead_name || p.plan_name || '').trim();
      const nameScore = scorePayerNameMatch(item.description, {
        lead_id: leadId,
        lead_name: leadName,
        responsavel: ctx?.responsavel || '',
        payer_aliases: ctx?.payer_aliases || [],
      });
      return {
        payment_id: String(p.$id || ''),
        lead_id: leadId,
        lead_name: leadName || 'Aluno',
        reference_month: ym,
        expected_amount: roundMoney(paymentExpectedAmount(p)),
        _name_score: nameScore,
      };
    })
    .filter((h) => h.payment_id && h.lead_id)
    .sort(
      (a, b) =>
        b._name_score - a._name_score ||
        a.lead_name.localeCompare(b.lead_name, 'pt-BR')
    );

  return ranked.slice(0, MAX_HINTS_PER_ITEM).map(({ _name_score, ...hint }) => hint);
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {Array} items
 * @param {{ period_start?: string, period_end?: string }} statementPeriod
 * @returns {Promise<Map<string, object[]>>}
 */
export async function buildPendingPaymentHintsByItemId(
  databases,
  academyId,
  items,
  statementPeriod
) {
  const out = new Map();
  if (!databases || !STUDENT_PAYMENTS_COL || !academyId) return out;

  const orphans = (items || []).filter(isCreditOrphanItem);
  if (!orphans.length) return out;

  const months = new Set();
  for (const item of orphans) {
    const ym = referenceMonthFromItemDate(item.date, statementPeriod);
    if (ym) months.add(ym);
  }
  if (!months.size) return out;

  const paymentsByMonth = new Map();
  const leadIds = new Set();

  for (const ym of months) {
    try {
      const res = await databases.listDocuments(DB_ID, STUDENT_PAYMENTS_COL, [
        Query.equal('academy_id', academyId),
        Query.equal('reference_month', ym),
        Query.limit(500),
      ]);
      const pending = (res.documents || []).filter(isPendingPayment);
      paymentsByMonth.set(ym, pending);
      for (const p of pending) {
        const lid = String(p.lead_id || '').trim();
        if (lid) leadIds.add(lid);
      }
    } catch {
      paymentsByMonth.set(ym, []);
    }
  }

  const payerContextByLeadId = await loadPayerContextByLeadIds(
    databases,
    academyId,
    [...leadIds]
  );

  for (const item of orphans) {
    const itemId = String(item.id || item.$id || '').trim();
    if (!itemId) continue;
    const hints = suggestPendingPaymentsForBankItem(item, statementPeriod, {
      paymentsByMonth,
      payerContextByLeadId,
    });
    if (hints.length) out.set(itemId, hints);
  }

  return out;
}
