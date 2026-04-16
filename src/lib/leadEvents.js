/**
 * Eventos de lead (collection lead_events no Appwrite).
 * Criar manualmente: academy_id, lead_id, type, from, to, text, at, created_by, payload_json.
 * Env: VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID
 */
import { databases, DB_ID, LEAD_EVENTS_COL } from './appwrite';
import { ID, Query } from 'appwrite';
import { buildClientDocumentPermissions } from './clientDocumentPermissions.js';

/** @param {{ ownerId?: string, teamId?: string, userId?: string }} ctx — ownerId ignorado no cliente (regra Appwrite). */
function eventPermissions(ctx = {}) {
  return buildClientDocumentPermissions({ teamId: ctx.teamId, userId: ctx.userId });
}

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
    return await databases.createDocument(DB_ID, LEAD_EVENTS_COL, ID.unique(), doc, perms);
  } catch (err) {
    console.warn('[leadEvents] Falha ao gravar evento:', err?.message);
    return null;
  }
}

export async function getLeadEvents(leadId, academyId, opts = {}) {
  if (!LEAD_EVENTS_COL) {
    return { documents: [], total: 0 };
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const res = await databases.listDocuments(DB_ID, LEAD_EVENTS_COL, [
    Query.equal('lead_id', String(leadId || '').trim()),
    Query.equal('academy_id', String(academyId || '').trim()),
    Query.orderDesc('at'),
    Query.limit(limit)
  ]);
  return res;
}
