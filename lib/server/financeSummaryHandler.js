/**
 * GET /api/finance/summary?from=&to=&regime=cash|competence
 */
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { txDirection } from './financeTxFields.js';
import { listFinancialTxForPeriod } from './financeTxQuery.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';

function json(res, status, body) {
  res.status(status).json(body);
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export default async function financeSummaryHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const regimeRaw = String(req.query.regime || FINANCE_REGIME.CASH).toLowerCase();
  const regime =
    regimeRaw === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;

  try {
    const docs = await listFinancialTxForPeriod(academyId, { from, to, regime });
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
      regime,
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
