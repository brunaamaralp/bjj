/**
 * Eventos de lead (collection lead_events no Appwrite).
 * Criar manualmente: academy_id, lead_id, type, from, to, text, at, created_by, payload_json.
 * Env: VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID
 */
import { createSessionJwt, databases, DB_ID, LEAD_EVENTS_COL } from './appwrite';
import { ID, Query } from 'appwrite';
import { authedFetch } from './authInterceptor.js';
import { buildClientDocumentPermissions } from './clientDocumentPermissions.js';
import { emitLeadTimelineChanged } from './leadTimelineEvents.js';
import { STUDENT_EVENT_TYPES } from './studentEventTypes.js';

/** @param {{ ownerId?: string, teamId?: string, userId?: string }} ctx — ownerId ignorado no cliente (regra Appwrite). */
function eventPermissions(ctx = {}) {
  return buildClientDocumentPermissions({ teamId: ctx.teamId, userId: ctx.userId });
}

/**
 * Payload mínimo de auditoria de aluno (student_id = lead_id na coleção).
 * @param {object} opts
 * @param {string} opts.studentId
 * @param {string} opts.academyId
 * @param {string} opts.actorUserId
 * @param {string} opts.type — um de STUDENT_EVENT_TYPES
 * @param {object} [opts.payload]
 * @param {string} [opts.text]
 */
export function buildStudentAuditPayload({ studentId, academyId, actorUserId, type, payload = {}, text = '' }) {
  return {
    student_id: String(studentId || '').trim(),
    academy_id: String(academyId || '').trim(),
    actor_user_id: String(actorUserId || 'user').trim(),
    timestamp: new Date().toISOString(),
    type: String(type || '').trim(),
    payload,
    text: String(text || '').trim(),
  };
}

/**
 * Grava evento tipado de ciclo de vida do aluno.
 */
export async function addStudentLifecycleEvent({
  studentId,
  academyId,
  actorUserId,
  type,
  payload = {},
  text = '',
  permissionContext = {},
}) {
  const audit = buildStudentAuditPayload({
    studentId,
    academyId,
    actorUserId,
    type,
    payload,
    text,
  });
  return addLeadEvent({
    academyId: audit.academy_id,
    leadId: audit.student_id,
    type: audit.type,
    text: audit.text || audit.type,
    at: audit.timestamp,
    createdBy: audit.actor_user_id,
    payloadJson: { ...audit.payload, student_id: audit.student_id, actor_user_id: audit.actor_user_id },
    permissionContext,
  });
}

export { STUDENT_EVENT_TYPES };

/**
 * @param {object} opts
 * @param {string} opts.academyId
 * @param {string} opts.leadId
 * @param {string} opts.type
 * @param {string|null} [opts.from]
 * @param {string|null} [opts.to]
 * @param {string|null} [opts.text]
 * @param {string} [opts.at]
 * @param {string} [opts.createdBy]
 * @param {object|null} [opts.payloadJson]
 * @param {{ ownerId?: string, teamId?: string, userId?: string }} [opts.permissionContext]
 */
export async function addLeadEvent({
  academyId,
  leadId,
  type,
  from = '',
  to = '',
  text = '',
  at = new Date().toISOString(),
  createdBy = 'user',
  payloadJson = null,
  permissionContext = {}
}) {
  if (!LEAD_EVENTS_COL) {
    console.warn('[leadEvents] VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID ausente — evento não gravado');
    return null;
  }
  const aid = String(academyId || '').trim();
  const lid = String(leadId || '').trim();
  if (!aid || !lid || !type) return null;

  const perms = eventPermissions(permissionContext);

  const doc = {
    academy_id: aid,
    lead_id: lid,
    type: String(type).slice(0, 64),
    from: from != null ? String(from).slice(0, 128) : '',
    to: to != null ? String(to).slice(0, 128) : '',
    text: text != null ? String(text).slice(0, 1000) : '',
    at,
    created_by: String(createdBy || 'user').slice(0, 50),
    payload_json: payloadJson != null ? JSON.stringify(payloadJson).slice(0, 65535) : ''
  };

  try {
    const created = await databases.createDocument(DB_ID, LEAD_EVENTS_COL, ID.unique(), doc, perms);
    emitLeadTimelineChanged(lid, { eventType: doc.type });
    return created;
  } catch (err) {
    console.warn('[leadEvents] Falha ao gravar evento:', err?.message);
    return null;
  }
}

async function fetchLeadEventsFromApi(leadId, academyId, limit) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const aid = String(academyId || '').trim();
  const lid = String(leadId || '').trim();
  if (!aid || !lid) throw new Error('academy_required');

  const params = new URLSearchParams({
    route: 'lead-events',
    lead_id: lid,
    limit: String(limit),
  });

  const res = await authedFetch(`/api/leads?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || data.erro || `error_${res.status}`);
  }
  const documents = Array.isArray(data.documents) ? data.documents : [];
  return { documents, total: Number(data.total) || documents.length };
}

/** Histórico do lead — via API (evita 401 no client Appwrite); fallback direto em dev. */
export async function getLeadEvents(leadId, academyId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);

  try {
    return await fetchLeadEventsFromApi(leadId, academyId, limit);
  } catch (err) {
    console.warn('[leadEvents] API indisponível, tentando Appwrite direto:', err?.message);
  }

  if (!LEAD_EVENTS_COL) {
    return { documents: [], total: 0 };
  }
  const res = await databases.listDocuments(DB_ID, LEAD_EVENTS_COL, [
    Query.equal('lead_id', String(leadId || '').trim()),
    Query.equal('academy_id', String(academyId || '').trim()),
    Query.orderDesc('at'),
    Query.limit(limit),
  ]);
  return res;
}

export async function updateLeadEvent(eventId, data) {
  if (!LEAD_EVENTS_COL || !eventId) return null;
  return await databases.updateDocument(DB_ID, LEAD_EVENTS_COL, eventId, data);
}
