/**
 * Eventos de lead (collection lead_events no Appwrite).
 * Criar manualmente: academy_id, lead_id, type, from, to, text, at, created_by, payload_json.
 * Env: VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID
 */
import { databases, DB_ID, LEAD_EVENTS_COL } from './appwrite';
import { ID, Query, Permission, Role } from 'appwrite';

function eventPermissions({ ownerId, teamId, userId }) {
  const perms = [];
  if (ownerId) {
    perms.push(
      Permission.read(Role.user(ownerId)),
      Permission.update(Role.user(ownerId)),
      Permission.delete(Role.user(ownerId))
    );
  }
  if (teamId) {
    perms.push(
      Permission.read(Role.team(teamId)),
      Permission.update(Role.team(teamId)),
      Permission.delete(Role.team(teamId))
    );
  }
  if (perms.length === 0) {
    if (userId) {
      perms.push(
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId))
      );
    } else {
      perms.push(
        Permission.read(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users())
      );
    }
  }
  return perms;
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

  return databases.createDocument(DB_ID, LEAD_EVENTS_COL, ID.unique(), doc, perms);
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
