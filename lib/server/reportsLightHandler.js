/**
 * GET /api/reports-light?type=finance|sales&from=&to=&regime=
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, ensureAcademyOwnerOrAdmin, DB_ID, databases } from './academyAccess.js';
import { cacheKey, getCached, setCached, cacheMaxAgeSeconds } from './reportsLightCache.js';
import { txDirection } from './financeTxFields.js';
import { listFinancialTxForPeriod } from './financeTxQuery.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';

const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';

function json(res, status, body, cacheHit = false) {
  res.setHeader('Cache-Control', `private, max-age=${cacheMaxAgeSeconds()}`);
  if (cacheHit) res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
  res.status(status).json(body);
}

async function financeSummary(academyId, from, to, regime) {
  const documents = await listFinancialTxForPeriod(academyId, { from, to, regime });
  let received = 0;
  let expenses = 0;
  let receivedCount = 0;
  let expenseCount = 0;
  const byMethod = {};

  for (const doc of documents) {
    if (String(doc.status || '').toLowerCase() !== 'settled') continue;
    const dir = txDirection(doc);
    const gross = Math.abs(Number(doc.gross) || 0);
    const net = Math.abs(Number(doc.net) || gross);
    const typeLc = String(doc.type || '').toLowerCase();
    if (dir === 'out') {
      expenses += gross;
      expenseCount += 1;
    } else if (typeLc === 'refund') {
      received += Number(net) || -gross;
      receivedCount += 1;
    } else {
      const add = Math.abs(Number(net) || gross);
      received += add;
      receivedCount += 1;
      const method = String(doc.method || 'outro').toLowerCase();
      byMethod[method] = (byMethod[method] || 0) + add;
    }
  }

  return {
    received,
    expenses,
    balance: received - expenses,
    receivedCount,
    expenseCount,
    truncated: false,
    totalLoaded: documents.length,
    regime,
    byMethod: Object.entries(byMethod).map(([method, totalAmt]) => ({ method, total: totalAmt })),
  };
}

async function salesSummary(academyId, from, to) {
  if (!SALES_COL) return { concludedCount: 0, concludedTotal: 0, cancelCount: 0, byChannel: [], truncated: false };
  const queries = [Query.equal('academy_id', academyId), Query.limit(500)];
  if (from) queries.push(Query.greaterThanEqual('$createdAt', new Date(`${from}T00:00:00`).toISOString()));
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    queries.push(Query.lessThan('$createdAt', d.toISOString()));
  }
  const list = await databases.listDocuments(DB_ID, SALES_COL, queries);
  const docs = list.documents || [];
  let concludedCount = 0;
  let concludedTotal = 0;
  let cancelCount = 0;
  const byChannel = {};
  for (const s of docs) {
    const st = String(s.status || '').toLowerCase();
    if (st === 'concluida') {
      concludedCount += 1;
      concludedTotal += Number(s.total) || 0;
      const canal = String(s.canal || 'presencial');
      byChannel[canal] = (byChannel[canal] || 0) + (Number(s.total) || 0);
    } else if (st === 'cancelada') cancelCount += 1;
  }
  return {
    concludedCount,
    concludedTotal,
    cancelCount,
    ticketMedio: concludedCount > 0 ? concludedTotal / concludedCount : 0,
    truncated: (list.total ?? docs.length) > docs.length,
    byChannel: Object.entries(byChannel).map(([canal, total]) => ({ canal, total })),
  };
}

export default async function reportsLightHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const type = String(req.query.type || 'finance').toLowerCase();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const regimeRaw = String(req.query.regime || FINANCE_REGIME.CASH).toLowerCase();
  const regime =
    regimeRaw === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;

  const key = cacheKey(['light', type, academyId, from, to, regime]);
  const cached = getCached(key);
  if (cached) return json(res, 200, cached, true);

  try {
    if (type === 'finance') {
      const body = {
        ok: true,
        type: 'finance',
        from,
        to,
        ...(await financeSummary(academyId, from, to, regime)),
      };
      setCached(key, body);
      return json(res, 200, body);
    }
    if (type === 'sales') {
      const body = { ok: true, type: 'sales', from, to, ...(await salesSummary(academyId, from, to)) };
      setCached(key, body);
      return json(res, 200, body);
    }
    return json(res, 400, { ok: false, error: 'invalid_type' });
  } catch (e) {
    console.error('[reportsLight]', e);
    return json(res, 500, { ok: false, error: 'load_failed' });
  }
}

export async function ensureReportsOwnerOnly(req, res, me) {
  return ensureAcademyOwnerOrAdmin(req, res, me);
}
