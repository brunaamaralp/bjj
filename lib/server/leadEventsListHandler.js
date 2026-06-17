import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { listLeadEventsServer } from './leadEvents.js';

/**
 * GET /api/leads?route=lead-events&lead_id=…
 * Lista timeline do lead via API key (evita 401 no client Appwrite).
 */
export default async function leadEventsListHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const leadId = String(req.query.lead_id || req.query.leadId || '').trim();
  if (!leadId) {
    return res.status(400).json({ error: 'lead_id_required' });
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

  try {
    const documents = await listLeadEventsServer(leadId, academyId, limit);
    return res.status(200).json({
      ok: true,
      documents,
      total: documents.length,
    });
  } catch (e) {
    console.error('[lead-events]', leadId, e?.message || e);
    return res.status(500).json({ error: e?.message || 'lead_events_failed' });
  }
}
