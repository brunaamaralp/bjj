import { Client, Databases, Query } from 'node-appwrite';
import { DB_ID, ACADEMIES_COL, resetAcademyMonthlyThreadUsage } from '../../src/services/planService.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

function billingDayFromDoc(doc) {
  return Math.min(Math.max(parseInt(String(doc?.billing_cycle_day ?? 1), 10) || 1, 1), 28);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const expected = String(process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers.authorization || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!expected || token !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    return res.status(503).json({ error: 'misconfigured' });
  }

  const dom = new Date().getUTCDate();
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  let reset = 0;
  let lastId = null;
  const t0 = Date.now();
  const MAX_MS = 8500;

  try {
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
  } catch (e) {
    console.error('[cron/reset-usage]', e?.message || e);
    return res.status(500).json({ error: 'list_failed' });
  }

  return res.status(200).json({ reset });
}
