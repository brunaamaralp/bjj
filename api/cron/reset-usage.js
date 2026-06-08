// ⚠️ Vercel Hobby: limite de 12 Serverless Functions em `/api/`.
// Este arquivo foi consolidado para reduzir a contagem de funções.

import { Client, Databases, Query, ID } from 'node-appwrite';
import { timingSafeEqual } from 'crypto';
import { DB_ID, ACADEMIES_COL, resetAcademyMonthlyThreadUsage } from '../../src/services/planService.js';
import { isBillingStoreConfigured, getBillingDatabases } from '../../lib/billing/billingAppwriteStore.js';
import { notifyAcademyOwner } from '../../lib/server/notifyAcademy.js';
import { parseAutomationsConfig, parsePendingAutomations } from '../../lib/automationCore.js';
import { sendAutomationTemplateCron } from '../../lib/server/sendAutomationCron.js';
import { runCollectionOverdue } from '../../lib/server/runCollectionOverdueCron.js';
import { runStockInventoryCron } from '../../lib/server/runStockInventoryCron.js';
import { runPlanFreezeCron } from '../../lib/server/runPlanFreezeCron.js';
import { runBillingSubscriptionReconcile } from '../../lib/server/billingReconcile.js';
import { runFinancePendingAlert } from '../../lib/server/runFinancePendingAlert.js';
import { runSalesReconcileCron } from '../../lib/server/runSalesReconcileCron.js';
import { runFinanceRecurrenceCron } from '../../lib/server/runFinanceRecurrenceCron.js';
import { runFinanceWhatsappAlerts } from '../../lib/server/runFinanceWhatsappAlerts.js';
import { runStudentPaymentReconcileCron } from '../../lib/server/runStudentPaymentReconcileCron.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const SUBS_COL = process.env.APPWRITE_BILLING_SUBSCRIPTIONS_COLLECTION_ID || process.env.APPWRITE_BILLING_SUBSCRIPTIONS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const PEOPLE_COL = STUDENTS_COL || LEADS_COL;
const TASKS_COL = process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '';
const NOTE_NOTIFICATIONS_COL = process.env.APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID || '';

function safeCompare(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function billingDayFromDoc(doc) {
  return Math.min(Math.max(parseInt(String(doc?.billing_cycle_day ?? 1), 10) || 1, 1), 28);
}

function daysUntil(dateIso) {
  const target = new Date(dateIso);
  if (!Number.isFinite(target.getTime())) return null;
  // Normalizar para início do dia UTC
  const diffMs = target.setUTCHours(0, 0, 0, 0) - new Date().setUTCHours(0, 0, 0, 0);
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

async function runResetUsage(databases, dom) {
  let reset = 0;
  let lastId = null;
  const t0 = Date.now();
  const MAX_MS = 8500;

  while (Date.now() - t0 < MAX_MS) {
    const queries = [Query.limit(40), Query.orderAsc('$id')];
    if (lastId) queries.push(Query.cursorAfter(lastId));
    const page = await databases.listDocuments(DB_ID, ACADEMIES_COL, queries);
    const docs = page.documents || [];
    if (!docs.length) break;

    for (const doc of docs) {
      if (billingDayFromDoc(doc) !== dom) continue;
      try {
        await resetAcademyMonthlyThreadUsage(doc);
        reset += 1;
      } catch (e) {
        console.error('[cron/reset-usage] falha ao resetar', doc.$id, e?.message || e);
      }
    }

    lastId = docs[docs.length - 1].$id;
    if (docs.length < 40) break;
  }

  return reset;
}

async function runCheckTrials({ billingDb, academyDb }) {
  let checked = 0;
  let notified = 0;
  let lastId = null;
  const MAX_MS = 8000;
  const t0 = Date.now();

  while (Date.now() - t0 < MAX_MS) {
    // Paginar assinaturas em trial
    const queries = [Query.equal('status', ['trial']), Query.limit(40), Query.orderAsc('$id')];
    if (lastId) queries.push(Query.cursorAfter(lastId));

    const page = await billingDb.listDocuments(DB_ID, SUBS_COL, queries);
    const docs = page.documents || [];
    if (!docs.length) break;

    for (const sub of docs) {
      checked++;
      const storeId = String(sub.storeId || '').trim();
      const periodEnd = sub.currentPeriodEnd;
      if (!storeId || !periodEnd) continue;

      const days = daysUntil(periodEnd);
      if (days === null) continue;

      // Buscar documento da academia
      let academy = null;
      try {
        academy = await academyDb.getDocument(DB_ID, ACADEMIES_COL, storeId);
      } catch {
        continue;
      }

      // D-3
      if (days === 3 && !academy.notified_trial_d3) {
        await notifyAcademyOwner(academy, 'trial_expiring_3days');
        await academyDb.updateDocument(DB_ID, ACADEMIES_COL, storeId, { notified_trial_d3: true });
        notified++;
        console.log('[cron/reset-usage] D-3 notificado:', storeId);
      }

      // D-1
      if (days === 1 && !academy.notified_trial_d1) {
        await notifyAcademyOwner(academy, 'trial_expiring_1day');
        await academyDb.updateDocument(DB_ID, ACADEMIES_COL, storeId, { notified_trial_d1: true });
        notified++;
        console.log('[cron/reset-usage] D-1 notificado:', storeId);
      }

      // D-0 (expirou hoje ou já passou)
      if (days <= 0 && !academy.notified_trial_expired) {
        await notifyAcademyOwner(academy, 'trial_expired');
        await academyDb.updateDocument(DB_ID, ACADEMIES_COL, storeId, { notified_trial_expired: true });
        notified++;
        console.log('[cron/reset-usage] D-0 (expirado) notificado:', storeId);
      }
    }

    lastId = docs[docs.length - 1].$id;
    if (docs.length < 40) break;
  }

  return { checked, notified };
}

async function runAutomations(databases) {
  const academyCache = new Map();
  let scanned = 0;
  let due = 0;
  let sent = 0;
  let errors = 0;
  const now = Date.now();
  const MAX_MS = 9000;
  const t0 = Date.now();

  if (!LEADS_COL) return { scanned, due, sent, errors, skipped: 'leads_collection_missing' };

  const page = await databases.listDocuments(DB_ID, LEADS_COL, [
    Query.equal('has_pending_automations', [true]),
    Query.limit(100),
  ]);
  const docs = page.documents || [];
  for (const doc of docs) {
    if (Date.now() - t0 >= MAX_MS) break;
    scanned += 1;
    const pending = parsePendingAutomations(doc.pending_automations);
    if (!pending.some((p) => p.sent !== true)) continue;

    const academyId = String(doc.academyId || '').trim();
    if (!academyId) continue;
    if (!academyCache.has(academyId)) {
      try {
        const academy = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        academyCache.set(academyId, academy);
      } catch {
        academyCache.set(academyId, null);
      }
    }
    const academy = academyCache.get(academyId);
    if (!academy) continue;

    let changed = false;
    const cfgMap = parseAutomationsConfig(academy.automations_config);

    const nextPending = [...pending];
    for (let i = 0; i < nextPending.length; i += 1) {
      const item = nextPending[i];
      if (item.sent === true) continue;
      const sendAtMs = new Date(item.sendAt).getTime();
      if (!Number.isFinite(sendAtMs) || sendAtMs > now) continue;
      due += 1;

      const cfg = cfgMap?.[item.key];
      if (!cfg?.active) {
        nextPending[i] = { ...item, sent: true };
        changed = true;
        continue;
      }

      const out = await sendAutomationTemplateCron({
        leadDoc: doc,
        academy,
        automationKey: item.key,
        templateKey: cfg.templateKey,
      });
      if (!out?.ok) {
        errors += 1;
        continue;
      }
      sent += 1;
      nextPending[i] = { ...item, sent: true };
      changed = true;
    }
    if (changed) {
      try {
        const stillHasPending = nextPending.some((p) => p.sent !== true);
        await databases.updateDocument(DB_ID, LEADS_COL, doc.$id, {
          pending_automations: JSON.stringify(nextPending),
          has_pending_automations: stillHasPending,
        });
      } catch {
        errors += 1;
      }
    }
  }

  return { scanned, due, sent, errors };
}

async function runTasksDue(databases) {
  if (!DB_ID || !TASKS_COL || !NOTE_NOTIFICATIONS_COL) {
    return { sucesso: false, erro: 'Configurações de banco de dados ausentes' };
  }
  const todayStr = new Date().toISOString().split('T')[0];
  const tasksRes = await databases.listDocuments(DB_ID, TASKS_COL, [
    Query.equal('status', 'pending'),
    Query.limit(500),
  ]);
  const pendingTasks = tasksRes.documents || [];
  let notifiedCount = 0;
  const nowIso = new Date().toISOString();
  for (const task of pendingTasks) {
    const dueDate = String(task.due_date || '').trim();
    const assignedTo = String(task.assigned_to || '').trim();
    if (!dueDate || !assignedTo) continue;
    if (dueDate.split('T')[0] > todayStr) continue;
    const notifRes = await databases.listDocuments(DB_ID, NOTE_NOTIFICATIONS_COL, [
      Query.equal('note_id', task.$id),
      Query.equal('type', 'task_due'),
      Query.limit(1),
    ]);
    if (notifRes.documents && notifRes.documents.length > 0) continue;
    await databases.createDocument(DB_ID, NOTE_NOTIFICATIONS_COL, ID.unique(), {
      academy_id: task.academy_id,
      type: 'task_due',
      note_id: task.$id,
      conversation_id: '',
      lead_id: task.lead_id || '',
      lead_name: task.lead_name || '',
      created_by_user_id: assignedTo,
      created_by_name: 'Sistema',
      created_at: nowIso,
      read_by: [],
    });
    notifiedCount++;
  }
  return { sucesso: true, notified: notifiedCount };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const expected = String(process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers.authorization || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!expected || !safeCompare(token, expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    return res.status(503).json({ error: 'misconfigured' });
  }

  // Crons consolidados neste endpoint para manter <= 12 functions no Hobby.
  // Modos: reset-usage (padrão), check-trials (9h UTC), automations (?action=automations).
  const action = String(req.query?.action || '').toLowerCase().trim();
  const hourUtc = new Date().getUTCHours();
  if (action === 'automations') {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(client);
    const out = await runAutomations(databases);
    return res.status(200).json({ mode: 'automations', ...out });
  }
  if (action === 'tasks-due') {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(client);
    const out = await runTasksDue(databases);
    return res.status(200).json({ mode: 'tasks-due', ...out });
  }
  if (action === 'collection-overdue') {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(client);
    const out = await runCollectionOverdue(databases, DB_ID);
    return res.status(200).json({ mode: 'collection-overdue', ...out });
  }
  if (action === 'stock-inventory') {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(client);
    const out = await runStockInventoryCron(databases, DB_ID);
    return res.status(200).json({ mode: 'stock-inventory', ...out });
  }
  if (action === 'billing-reconcile') {
    const out = await runBillingSubscriptionReconcile();
    return res.status(200).json({ mode: 'billing-reconcile', ...out });
  }
  if (action === 'finance-pending-alert') {
    const out = await runFinancePendingAlert();
    return res.status(200).json({ mode: 'finance-pending-alert', ...out });
  }
  if (action === 'sales-reconcile') {
    const out = await runSalesReconcileCron();
    return res.status(200).json({ mode: 'sales-reconcile', ...out });
  }
  if (action === 'plan-freeze') {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(client);
    const ACADEMIES_COL =
      process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
    const out = await runPlanFreezeCron(databases, DB_ID, PEOPLE_COL, ACADEMIES_COL);
    return res.status(200).json({ mode: 'plan-freeze', ...out });
  }
  if (action === 'finance-recurrence') {
    const out = await runFinanceRecurrenceCron();
    return res.status(200).json({ mode: 'finance-recurrence', ...out });
  }
  if (action === 'finance-whatsapp-alerts') {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(client);
    const out = await runFinanceWhatsappAlerts(databases, DB_ID);
    return res.status(200).json({ mode: 'finance-whatsapp-alerts', ...out });
  }
  if (action === 'student-payment-reconcile') {
    const out = await runStudentPaymentReconcileCron();
    return res.status(200).json({ mode: 'student-payment-reconcile', ...out });
  }
  const shouldCheckTrials = action === 'check-trials' || hourUtc === 9;

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  if (!shouldCheckTrials) {
    const dom = new Date().getUTCDate();
    const reset = await runResetUsage(databases, dom);
    return res.status(200).json({ mode: 'reset-usage', reset });
  }

  if (!isBillingStoreConfigured() || !SUBS_COL) {
    return res.status(200).json({ mode: 'check-trials', checked: 0, notified: 0, skipped: 'billing_not_configured' });
  }

  const billingDb = getBillingDatabases();
  const academyDb = new Databases(client);
  if (!billingDb || !academyDb) {
    return res.status(200).json({ mode: 'check-trials', checked: 0, notified: 0, skipped: 'billing_db_unavailable' });
  }

  const out = await runCheckTrials({ billingDb, academyDb });
  return res.status(200).json({ mode: 'check-trials', ...out });
}
