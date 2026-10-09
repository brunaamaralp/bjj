/**
 * GET /api/finance?route=professor-closing&month=YYYY-MM
 * Hub mensal de fechamento (somente leitura nesta task).
 */
import { ensureAuth, ensureAcademyAccess, databases, DB_ID } from './academyAccess.js';
import { apiErro, logApiError } from './friendlyError.js';
import {
  aggregateProfessorClosingMonth,
  monthBoundsFromYearMonth,
} from './professorClosingAggregate.js';

function json(res, status, body) {
  res.status(status).json(body);
}

export default async function professorClosingHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const month = String(req.query.month || '').trim();
  if (!monthBoundsFromYearMonth(month)) {
    return json(res, 400, { ok: false, error: 'month_required' });
  }

  if (!DB_ID) {
    return json(res, 503, { ok: false, error: 'database_not_configured' });
  }

  try {
    const payload = await aggregateProfessorClosingMonth(databases, DB_ID, academyId, month);
    return json(res, 200, payload);
  } catch (e) {
    if (e?.code === 'invalid_month') {
      return json(res, 400, { ok: false, error: 'month_required' });
    }
    logApiError('professor-closing', e);
    return json(res, 500, { ok: false, error: apiErro(e, 'load') });
  }
}
