// ⚠️ Vercel Hobby: limite de 12 Serverless Functions em `/api/`.
// Este arquivo foi consolidado para reduzir a contagem de funções.

import { Client, Databases, Query } from 'node-appwrite';
import { timingSafeEqual } from 'crypto';
import { DB_ID, ACADEMIES_COL, resetAcademyMonthlyThreadUsage } from '../../src/services/planService.js';
import { isBillingStoreConfigured, getBillingDatabases } from '../../lib/billing/billingAppwriteStore.js';
import { notifyAcademyOwner } from '../../lib/server/notifyAcademy.js';
import { sendZapsterText } from '../../lib/server/zapsterSend.js';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  applyWhatsappTemplatePlaceholders,
} from '../../lib/whatsappTemplateDefaults.js';

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

const AUTOMATION_DEFAULTS = {
  schedule_confirm: { active: false, templateKey: 'confirm', delayMinutes: 0 },
  presence_confirmed: { active: false, templateKey: 'post_class', delayMinutes: 0 },
  missed: { active: false, templateKey: 'missed', delayMinutes: 0 },
  waiting_decision: { active: false, templateKey: 'recovery', delayMinutes: 1440 },
  converted: { active: false, templateKey: 'confirm', delayMinutes: 0 },
  schedule_reminder: { active: false, templateKey: 'reminder', delayMinutes: 120 },
};

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

function parseAutomationsConfig(raw) {
  try {
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw ?? {};
    return Object.fromEntries(
      Object.entries(AUTOMATION_DEFAULTS).map(([key, defaults]) => [
        key,
        { ...defaults, ...(saved[key] ?? {}) },
      ])
    );
  } catch {
    return AUTOMATION_DEFAULTS;
  }
}

function parsePendingAutomations(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        key: String(x.key || '').trim(),
        sendAt: String(x.sendAt || '').trim(),
        sent: x.sent === true,
      }))
      .filter((x) => x.key && x.sendAt);
  } catch {
    return [];
  }
}

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
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
    let templatesOverride = {};
    try {
      const raw = academy.whatsappTemplates;
      const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (p && typeof p === 'object' && !Array.isArray(p)) templatesOverride = p;
    } catch {
      templatesOverride = {};
    }
    const templates = { ...DEFAULT_WHATSAPP_TEMPLATES, ...templatesOverride };

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

      const templateRaw = String(templates[cfg.templateKey] || '').trim();
      const phone = normalizePhone(doc.phone);
      const instanceId = String(academy?.zapster_instance_id || academy?.zapsterInstanceId || '').trim();
      if (!templateRaw || !phone || !instanceId) {
        errors += 1;
        continue;
      }
      const message = applyWhatsappTemplatePlaceholders(templateRaw, {
        lead: {
          name: doc.name,
          scheduledDate: doc.scheduledDate,
          scheduledTime: doc.scheduledTime,
        },
        academyName: String(academy?.name || '').trim(),
      });
      const out = await sendZapsterText({ recipient: phone, text: message, instanceId });
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
