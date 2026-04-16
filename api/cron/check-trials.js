/**
 * Verifica trials expirando e notifica donos de academia via WhatsApp.
 *
 * Eventos:
 *   - D-3: trial_expiring_3days → notified_trial_d3
 *   - D-1: trial_expiring_1day  → notified_trial_d1
 *   - D-0: trial_expired        → notified_trial_expired
 *
 * Autenticação: Authorization: Bearer <CRON_SECRET>
 * Recomendação de schedule: 0 9 * * * (09:00 UTC = 06:00 BRT)
 */
import { Client, Databases, Query } from 'node-appwrite';
import { isBillingStoreConfigured, getBillingDatabases } from '../../lib/billing/billingAppwriteStore.js';
import { notifyAcademyOwner } from '../../lib/server/notifyAcademy.js';
import { timingSafeEqual } from 'crypto';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const SUBS_COL = process.env.APPWRITE_BILLING_SUBSCRIPTIONS_COLLECTION_ID || '';

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

function daysUntil(dateIso) {
  const target = new Date(dateIso);
  if (!Number.isFinite(target.getTime())) return null;
  const now = new Date();
  // Normalizar para início do dia UTC
  const diffMs = target.setUTCHours(0, 0, 0, 0) - new Date().setUTCHours(0, 0, 0, 0);
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
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

  if (!isBillingStoreConfigured() || !SUBS_COL) {
    return res.status(200).json({ checked: 0, notified: 0, skipped: 'billing_not_configured' });
  }

  const billingDb = getBillingDatabases();
  if (!billingDb) {
    return res.status(200).json({ checked: 0, notified: 0, skipped: 'billing_db_unavailable' });
  }

  const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const academyDb = new Databases(adminClient);

  let checked = 0;
  let notified = 0;
  let lastId = null;
  const MAX_MS = 8000;
  const t0 = Date.now();

  try {
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
          continue; // academia não encontrada — pular
        }

        // D-3
        if (days === 3 && !academy.notified_trial_d3) {
          await notifyAcademyOwner(academy, 'trial_expiring_3days');
          await academyDb.updateDocument(DB_ID, ACADEMIES_COL, storeId, { notified_trial_d3: true });
          notified++;
          console.log('[cron/check-trials] D-3 notificado:', storeId);
        }

        // D-1
        if (days === 1 && !academy.notified_trial_d1) {
          await notifyAcademyOwner(academy, 'trial_expiring_1day');
          await academyDb.updateDocument(DB_ID, ACADEMIES_COL, storeId, { notified_trial_d1: true });
          notified++;
          console.log('[cron/check-trials] D-1 notificado:', storeId);
        }

        // D-0 (expirou hoje ou já passou)
        if (days <= 0 && !academy.notified_trial_expired) {
          await notifyAcademyOwner(academy, 'trial_expired');
          await academyDb.updateDocument(DB_ID, ACADEMIES_COL, storeId, { notified_trial_expired: true });
          notified++;
          console.log('[cron/check-trials] D-0 (expirado) notificado:', storeId);
        }
      }

      lastId = docs[docs.length - 1].$id;
      if (docs.length < 40) break;
    }
  } catch (e) {
    console.error('[cron/check-trials] erro:', e?.message || e);
    return res.status(500).json({ error: 'internal', message: e?.message });
  }

  console.log('[cron/check-trials] concluído:', { checked, notified });
  return res.status(200).json({ checked, notified });
}
