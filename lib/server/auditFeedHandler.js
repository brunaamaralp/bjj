/**
 * GET /api/reports/audit-feed — feed de atividade da academia.
 */
import { ensureAuth, ensureAcademyAccess, isAcademyOwnerOrAdminUser } from './academyAccess.js';
import {
  listAuditEventsServer,
  mapAuditDocToFeedEvent,
  resolveAuditFeedScope,
} from './auditLog.js';
import { AUDIT_DOMAIN_LABELS, eventMatchesAuditDomain } from './auditEventTypes.js';

function json(res, status, body) {
  res.status(status).json(body);
}

function parsePeriod(req) {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : null;
  let toIso = null;
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    toIso = d.toISOString();
  }
  return { from, to, fromIso, toIso };
}

export default async function auditFeedHandler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, erro: 'Method Not Allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const scope = await resolveAuditFeedScope(academyDoc, me, isAcademyOwnerOrAdminUser);
  const { fromIso, toIso } = parsePeriod(req);
  const domain = String(req.query.domain || '').trim().toLowerCase();
  const eventType = String(req.query.event_type || '').trim();
  const leadId = String(req.query.lead_id || '').trim();
  const cursor = String(req.query.cursor || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

  let actorId = String(req.query.actor_id || '').trim();
  if (scope.scope === 'self') {
    actorId = scope.actorId;
  }

  const { documents, hasMore, nextCursor } = await listAuditEventsServer(academyId, {
    limit: domain || leadId ? Math.min(limit * 3, 100) : limit,
    cursor: cursor || undefined,
    fromIso: fromIso || undefined,
    toIso: toIso || undefined,
    actorId: actorId || undefined,
    eventType: eventType || undefined,
  });

  let events = documents.map(mapAuditDocToFeedEvent).map((ev) => ({
    ...ev,
    domain_label: AUDIT_DOMAIN_LABELS[ev.domain] || ev.domain || 'Geral',
  }));

  if (domain) {
    events = events.filter((ev) => eventMatchesAuditDomain(ev.event_type, domain));
  }
  if (leadId) {
    events = events.filter((ev) => String(ev.context?.lead_id || '').trim() === leadId);
  }
  if (domain || leadId) {
    events = events.slice(0, limit);
  }

  return json(res, 200, {
    ok: true,
    events,
    next_cursor: hasMore ? nextCursor : null,
    has_more: Boolean(hasMore && events.length >= limit),
    scope: scope.scope,
  });
}
