/**
 * Cron diário: lembretes de mensalidade via WhatsApp (Zapster).
 * Não altera régua de tarefas nem billing Asaas.
 */
import { Query } from 'node-appwrite';
import { sendZapsterText } from './zapsterSend.js';
import { recordFinancialAudit } from './financialAuditLog.js';
import { academyHasFinanceModule } from '../../src/lib/collectionRules.js';
import {
  normalizeWhatsappRemindersConfig,
  applyFinanceReminderPlaceholders,
  formatReminderCurrencyBrl,
  formatReminderDatePt,
  paymentDueDateKey,
  addDaysToYmd,
  todayYmdUtc,
  isPaymentEligibleForWhatsappReminder,
  whatsappRemindersActive,
} from '../../src/lib/financeWhatsappReminders.js';

const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const PEOPLE_COL = STUDENTS_COL || LEADS_COL;
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID || process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const AUDIT_COL =
  process.env.APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID ||
  process.env.VITE_APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID ||
  '';

function parseFinanceConfig(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

async function listAllPayments(databases, dbId, academyId) {
  if (!PAYMENTS_COL) return [];
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (;;) {
    const queries = [Query.equal('academy_id', academyId), Query.limit(PAGE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, PAYMENTS_COL, queries);
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return all;
}

async function getPersonDoc(databases, dbId, leadId, cache) {
  const id = String(leadId || '').trim();
  if (!id || !PEOPLE_COL) return null;
  if (cache.has(id)) return cache.get(id);
  try {
    const doc = await databases.getDocument(dbId, PEOPLE_COL, id);
    cache.set(id, doc);
    return doc;
  } catch {
    cache.set(id, null);
    return null;
  }
}

async function wasReminderSentToday(databases, dbId, { academyId, leadId, referenceMonth, today }) {
  if (!AUDIT_COL) return false;
  const list = await databases
    .listDocuments(dbId, AUDIT_COL, [
      Query.equal('action', 'whatsapp_reminder'),
      Query.equal('student_id', String(leadId)),
      Query.equal('academy_id', String(academyId)),
      Query.limit(30),
    ])
    .catch(() => ({ documents: [] }));

  for (const doc of list.documents || []) {
    let meta = {};
    try {
      meta = typeof doc.meta_json === 'string' ? JSON.parse(doc.meta_json) : doc.meta_json || {};
    } catch {
      meta = {};
    }
    if (String(meta.reference_month || '') === String(referenceMonth || '') && meta.sent_date === today) {
      return true;
    }
  }
  return false;
}

function buildMessage(template, { person, payment, academyName, dueKey }) {
  const nome = String(person?.name || person?.lead_name || '').trim() || 'Aluno';
  const plano = String(payment?.plan_name || person?.plan || '').trim();
  return applyFinanceReminderPlaceholders(template, {
    nome,
    valor: formatReminderCurrencyBrl(payment?.amount),
    vencimento: formatReminderDatePt(dueKey),
    plano,
    academia: academyName,
  });
}

async function trySendReminder(databases, dbId, {
  academyDoc,
  payment,
  person,
  template,
  kind,
  stats,
}) {
  const academyId = academyDoc.$id;
  const leadId = String(payment.lead_id || '').trim();
  const referenceMonth = String(payment.reference_month || '').trim();
  const today = todayYmdUtc();
  const phone = String(person?.phone || '').replace(/\D/g, '');
  const instanceId = String(academyDoc?.zapster_instance_id || academyDoc?.zapsterInstanceId || '').trim();
  const academyName = String(academyDoc?.name || '').trim();

  if (!leadId || !referenceMonth) {
    stats.skipped += 1;
    return;
  }
  if (!phone) {
    stats.skippedNoPhone += 1;
    return;
  }
  if (!instanceId) {
    stats.skippedNoZapster += 1;
    return;
  }

  if (await wasReminderSentToday(databases, dbId, { academyId, leadId, referenceMonth, today })) {
    stats.skippedAlreadySent += 1;
    return;
  }

  const dueKey = paymentDueDateKey(payment);
  const text = buildMessage(template, { person, payment, academyName, dueKey });
  if (!text.trim()) {
    stats.skipped += 1;
    return;
  }

  const out = await sendZapsterText({ recipient: phone, text, instanceId });
  if (!out?.ok) {
    stats.errors += 1;
    return;
  }

  await recordFinancialAudit({
    action: 'whatsapp_reminder',
    payment_id: payment.$id,
    student_id: leadId,
    academy_id: academyId,
    user_id: 'system',
    meta: {
      reference_month: referenceMonth,
      sent_date: today,
      kind,
      lead_id: leadId,
    },
  });

  stats.sent += 1;
}

async function processAcademy(databases, dbId, academyDoc) {
  const stats = {
    sent: 0,
    skipped: 0,
    skippedNoPhone: 0,
    skippedNoZapster: 0,
    skippedAlreadySent: 0,
    errors: 0,
  };

  if (!academyHasFinanceModule(academyDoc)) {
    return { skipped: 'finance_module_off', ...stats };
  }

  const financeConfig = parseFinanceConfig(academyDoc.financeConfig);
  if (!whatsappRemindersActive(financeConfig)) {
    return { skipped: 'reminders_disabled', ...stats };
  }

  if (!PAYMENTS_COL || !PEOPLE_COL) {
    return { skipped: 'collections_not_configured', ...stats };
  }

  const reminders = normalizeWhatsappRemindersConfig(financeConfig.whatsappReminders);
  const today = todayYmdUtc();
  const targetDueSoon = reminders.dueSoon.enabled ? addDaysToYmd(today, reminders.dueSoon.daysBefore) : null;
  const targetOverdue = reminders.overdue.enabled ? addDaysToYmd(today, -reminders.overdue.daysAfter) : null;

  const payments = await listAllPayments(databases, dbId, academyDoc.$id);
  const peopleCache = new Map();

  for (const payment of payments) {
    if (!isPaymentEligibleForWhatsappReminder(payment)) continue;
    const dueKey = paymentDueDateKey(payment);
    if (!dueKey) continue;

    const person = await getPersonDoc(databases, dbId, payment.lead_id, peopleCache);
    if (!person) {
      stats.skipped += 1;
      continue;
    }

    if (targetDueSoon && dueKey === targetDueSoon) {
      await trySendReminder(databases, dbId, {
        academyDoc,
        payment,
        person,
        template: reminders.dueSoon.message,
        kind: 'dueSoon',
        stats,
      });
      continue;
    }

    if (targetOverdue && dueKey === targetOverdue) {
      await trySendReminder(databases, dbId, {
        academyDoc,
        payment,
        person,
        template: reminders.overdue.message,
        kind: 'overdue',
        stats,
      });
    }
  }

  return stats;
}

export async function runFinanceWhatsappAlerts(databases, dbId) {
  if (!dbId || !ACADEMIES_COL) {
    return { processed: 0, error: 'misconfigured' };
  }

  const PAGE = 40;
  let processed = 0;
  let totals = { sent: 0, errors: 0, skippedAlreadySent: 0 };
  let lastId = null;
  const t0 = Date.now();
  const MAX_MS = 50000;

  while (Date.now() - t0 < MAX_MS) {
    const queries = [Query.limit(PAGE), Query.orderAsc('$id')];
    if (lastId) queries.push(Query.cursorAfter(lastId));
    const page = await databases.listDocuments(dbId, ACADEMIES_COL, queries);
    const docs = page.documents || [];
    if (!docs.length) break;

    for (const doc of docs) {
      try {
        const out = await processAcademy(databases, dbId, doc);
        if (!out?.skipped) processed += 1;
        totals.sent += out.sent || 0;
        totals.errors += out.errors || 0;
        totals.skippedAlreadySent += out.skippedAlreadySent || 0;
      } catch (e) {
        console.error('[cron/finance-whatsapp-alerts] academy', doc.$id, e?.message || e);
        totals.errors += 1;
      }
    }

    lastId = docs[docs.length - 1].$id;
    if (docs.length < PAGE) break;
  }

  return { processed, ...totals };
}

export { processAcademy as processFinanceWhatsappAlertsAcademy };
