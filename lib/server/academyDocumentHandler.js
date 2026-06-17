import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';

/**
 * GET /api/leads?route=academy-document
 * Documento da academia via API key (evita 401 no client Appwrite).
 */
export default async function academyDocumentHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  return res.status(200).json({
    ok: true,
    document: access.doc,
  });
}
