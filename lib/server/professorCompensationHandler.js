/**
 * GET/POST /api/agent?route=professor-compensation
 * Persistência de academy.settings.professorCompensation (titular ou admin).
 */
import { apiErro, logApiError } from './friendlyError.js';
import {
  ensureAuth,
  ensureAcademyAccess,
  ensureAcademyOwnerOrAdmin,
  databases,
  DB_ID,
  invalidateAcademyAccessCache,
} from './academyAccess.js';
import {
  readProfessorCompensationFromAcademy,
  mergeProfessorCompensationIntoSettings,
} from '../../src/lib/professorCompensationStorage.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function json(res, status, body) {
  res.status(status).json(body);
}

export default async function professorCompensationHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;

  if (!ACADEMIES_COL) {
    return json(res, 503, { ok: false, error: 'academies_not_configured' });
  }

  try {
    if (req.method === 'GET') {
      // Members need read for Estoque withdraw debit %; only POST is owner/admin.
      const access = await ensureAcademyAccess(req, res, me);
      if (!access) return;
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, access.academyId);
      return json(res, 200, {
        ok: true,
        compensation: readProfessorCompensationFromAcademy(doc),
      });
    }

    const access = await ensureAcademyOwnerOrAdmin(req, res, me);
    if (!access) return;
    const { academyId } = access;

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return json(res, 400, { ok: false, error: 'invalid_json' });
      }
    }
    if (!body || typeof body !== 'object') {
      return json(res, 400, { ok: false, error: 'body_required' });
    }
    if (body.compensation === undefined) {
      return json(res, 400, { ok: false, error: 'compensation_required' });
    }

    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    const merged = mergeProfessorCompensationIntoSettings(doc.settings, body.compensation);
    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
      settings: JSON.stringify(merged),
    });
    invalidateAcademyAccessCache(academyId);

    return json(res, 200, {
      ok: true,
      compensation: readProfessorCompensationFromAcademy({ settings: JSON.stringify(merged) }),
    });
  } catch (e) {
    logApiError('professor-compensation', e);
    return json(res, 500, { ok: false, error: apiErro(e, 'save') });
  }
}
