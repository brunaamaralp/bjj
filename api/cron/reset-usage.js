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

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('', { status: 405, headers: { Allow: 'GET' } });
  }

  const expected = String(process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers.get('authorization') || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }

  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    return new Response(JSON.stringify({ error: 'misconfigured' }), { status: 503, headers: { 'content-type': 'application/json' } });
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
    return new Response(JSON.stringify({ error: 'list_failed' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }

  return new Response(JSON.stringify({ reset }), { status: 200, headers: { 'content-type': 'application/json' } });
}
