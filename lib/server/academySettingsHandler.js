/**
 * POST /api/academy/settings — atualização de campos gerais da academia (titular ou admin).
 */
import { ensureAuth, ensureAcademyOwnerOrAdmin, databases, DB_ID } from './academyAccess.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function json(res, status, body) {
  res.status(status).json(body);
}

const ALLOWED_KEYS = new Set([
  'name',
  'phone',
  'email',
  'address',
  'quickTimes',
  'vertical',
  'uiLabels',
  'modules',
  'autentique_account_email',
]);

export default async function academySettingsHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { sucesso: false, erro: 'Method Not Allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
  if (!access) return;
  const { academyId } = access;

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { sucesso: false, erro: 'JSON inválido' });
    }
  }
  if (!body || typeof body !== 'object') {
    return json(res, 400, { sucesso: false, erro: 'body_required' });
  }

  const patch = {};
  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return json(res, 400, { sucesso: false, erro: 'nenhum_campo_valido' });
  }

  if (patch.phone !== undefined) {
    patch.phone = String(patch.phone || '').replace(/\D/g, '');
  }
  if (patch.vertical !== undefined) {
    patch.vertical = String(patch.vertical || '').trim() === 'physio' ? 'physio' : 'fitness';
  }
  if (patch.uiLabels !== undefined && typeof patch.uiLabels !== 'string') {
    patch.uiLabels = JSON.stringify(patch.uiLabels || {});
  }
  if (patch.modules !== undefined && typeof patch.modules !== 'string') {
    patch.modules = JSON.stringify(patch.modules || {});
  }
  if (patch.autentique_account_email !== undefined) {
    patch.autentique_account_email = String(patch.autentique_account_email || '').trim();
  }

  try {
    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, patch);
    return json(res, 200, { sucesso: true, academyId });
  } catch (e) {
    console.error('[academy/settings]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao salvar configurações' });
  }
}
