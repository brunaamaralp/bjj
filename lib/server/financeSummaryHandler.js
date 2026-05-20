/**
 * GET /api/finance/summary?from=&to=
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import { isExpenseType, txDirection } from './financeTxFields.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

function json(res, status, body) {
  res.status(status).json(body);
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

async function listTxInRange(academyId, from, to) {
  const queries = [Query.equal('academyId', academyId), Query.limit(500)];
  if (from) queries.push(Query.greaterThanEqual('$createdAt', new Date(from).toISOString()));
  if (to) {
    const d = new Date(to);
    d.setDate(d.getDate() + 1);
    queries.push(Query.lessThan('$createdAt', d.toISOString()));
  }
  const all = [];
  let cursor = null;
  for (let page = 0; page < 20; page += 1) {
    const q = [...queries];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    const docs = res.documents || [];
    all.push(...docs);
    if (docs.length < 500) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return all;
}

export default async function financeSummaryHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!FINANCIAL_TX_COL || !DB_ID) return json(res, 503, { ok: false, error: 'not_configured' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();

  try {
    const docs = await listTxInRange(academyId, from, to);
    let settledIn = 0;
    let settledOut = 0;
    let pendingIn = 0;
    let pendingOut = 0;
    let countSettled = 0;
    let countPending = 0;

    for (const doc of docs) {
      const st = String(doc.status || '').toLowerCase();
      if (st === 'cancelled') continue;
      const dir = txDirection(doc);
      const gross = Math.abs(Number(doc.gross) || 0);
      const net = Math.abs(Number(doc.net) || gross);
      if (st === 'settled') {
        countSettled += 1;
        if (dir === 'out') settledOut += gross;
        else settledIn += net;
      } else if (st === 'pending') {
        countPending += 1;
        if (dir === 'out') pendingOut += gross;
        else pendingIn += gross;
      }
    }

    const periodBalance = round2(settledIn - settledOut);

    return json(res, 200, {
      ok: true,
      from: from || null,
      to: to || null,
      settledIn: round2(settledIn),
      settledOut: round2(settledOut),
      periodBalance,
      pendingIn: round2(pendingIn),
      pendingOut: round2(pendingOut),
      countSettled,
      countPending,
      count: docs.length,
    });
  } catch (e) {
    console.error('[financeSummary]', e);
    return json(res, 500, { ok: false, error: 'summary_failed' });
  }
}
