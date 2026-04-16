// ⚠️ Vercel Hobby: limite de 12 Serverless Functions em `/api/`.
// Este arquivo foi consolidado para reduzir a contagem de funções.

import { Client, Databases, Query } from 'node-appwrite';
import { timingSafeEqual } from 'crypto';
import { DB_ID, ACADEMIES_COL, resetAcademyMonthlyThreadUsage } from '../../src/services/planService.js';
import { isBillingStoreConfigured, getBillingDatabases } from '../../lib/billing/billingAppwriteStore.js';
import { notifyAcademyOwner } from '../../lib/server/notifyAcademy.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const SUBS_COL = process.env.APPWRITE_BILLING_SUBSCRIPTIONS_COLLECTION_ID || process.env.APPWRITE_BILLING_SUBSCRIPTIONS_COLLECTION_ID || '';

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

  // Ambos os crons (00:00 reset e 09:00 trials) chamam este MESMO endpoint.
  // Selecionamos o modo pelo horário UTC ou por query param (?action=check-trials).
  const action = String(req.query?.action || '').toLowerCase().trim();
  const hourUtc = new Date().getUTCHours();
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
