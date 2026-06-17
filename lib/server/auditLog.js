/**
 * Escrita canônica de auditoria em academy_events.
 * @see docs/superpowers/specs/2026-06-17-audit-log-siem-TECH.md
 */
import { Client, Databases, ID, Query, Permission, Role } from 'node-appwrite';
import { createDocumentResilient } from './appwriteSchemaResilient.js';
import { addLeadEventServer } from './leadEvents.js';
import {
  AUDIT_SCHEMA_VERSION,
  auditDomainForEventType,
  defaultSummary,
} from './auditEventTypes.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMY_EVENTS_COL = String(
  process.env.APPWRITE_ACADEMY_EVENTS_COLLECTION_ID ||
    process.env.VITE_APPWRITE_ACADEMY_EVENTS_COLLECTION_ID ||
    ''
).trim();

const SECRET_KEYS = new Set([
  'password',
  'tempPassword',
  'passwordHash',
  'token',
  'jwt',
  'apiKey',
  'api_key',
  'secret',
]);

const adminClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = adminClient ? new Databases(adminClient) : null;

function defaultPerms() {
  return [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
}

/** @param {Record<string, unknown>} obj */
export function stripSecrets(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_KEYS.has(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = stripSecrets(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** @param {{ type?: string, id?: string, userId?: string, name?: string } | undefined} actor */
export function normalizeActor(actor) {
  const id = String(actor?.id || actor?.userId || 'system').trim() || 'system';
  let type = String(actor?.type || '').trim();
  if (!type) {
    if (id === 'system') type = 'system';
    else if (id === 'ai-agent') type = 'ai-agent';
    else type = 'user';
  }
  return {
    type,
    id,
    name: String(actor?.name || '').trim(),
  };
}

/** @param {{ $id?: string, name?: string, email?: string } | undefined} me */
export function actorFromMe(me) {
  return normalizeActor({
    type: 'user',
    id: String(me?.$id || '').trim() || 'system',
    name: String(me?.name || me?.email || 'Usuário').trim() || 'Usuário',
  });
}

/**
 * Converte evento legado (recordAcademyEvent) para envelope canônico.
 * @param {Record<string, unknown>} event
 */
export function legacyAcademyEventToInput(event) {
  const eventType = String(event.event_type || '').trim();
  const actor = normalizeActor({
    id: event.actor_user_id,
    name: event.actor_name,
  });
  const targetUserId = String(event.target_user_id || '').trim();
  const payload = stripSecrets({
    ...event,
    new_role: event.new_role,
    previous_role: event.previous_role,
    changed_fields: event.changed_fields,
    previous_values: event.previous_values,
    new_values: event.new_values,
  });

  return {
    eventType,
    academyId: String(event.academy_id || '').trim(),
    actor,
    target: targetUserId
      ? { type: 'user', id: targetUserId, name: String(event.target_name || '').trim() }
      : event.target_id || event.target_name
        ? {
            type: String(event.target_type || 'entity').trim() || 'entity',
            id: String(event.target_id || '').trim(),
            name: String(event.target_name || '').trim(),
          }
        : undefined,
    payload,
    timestamp: event.timestamp ? String(event.timestamp) : undefined,
    source: 'legacy.recordAcademyEvent',
    teamLegacy: {
      previous_role: event.previous_role,
      new_role: event.new_role,
      changed_fields: event.changed_fields,
      previous_values: event.previous_values,
      new_values: event.new_values,
    },
  };
}

/**
 * @param {import('./auditLog.js').AuditEventInput} input
 */
export function mapEnvelopeToAcademyDoc(input) {
  const academyId = String(input.academyId || '').trim();
  const eventType = String(input.eventType || '').trim();
  const actor = normalizeActor(input.actor);
  const timestamp = input.timestamp || new Date().toISOString();
  const parsed = defaultSummary(eventType, {
    actor,
    target: input.target,
    payload: input.payload,
  });
  const summary = String(input.summary || parsed).trim().slice(0, 512);
  const domain = eventType.includes('.') ? eventType.split('.')[0] : eventType.split('_')[0] || '';

  const envelope = {
    schema_version: AUDIT_SCHEMA_VERSION,
    event_type: eventType,
    summary,
    domain,
    actor: { type: actor.type, id: actor.id, name: actor.name },
    target: input.target || null,
    context: stripSecrets(input.context || {}),
    severity: input.severity || 'info',
    source: String(input.source || '').slice(0, 128),
    payload: stripSecrets(input.payload || {}),
    changes: input.changes || null,
  };

  const targetId = String(input.target?.id || '').trim();
  const targetType = String(input.target?.type || '').trim();
  const targetName = String(input.target?.name || '').trim();
  const teamLegacy = input.teamLegacy || {};

  const doc = {
    academy_id: academyId,
    event_type: eventType.slice(0, 64),
    actor_user_id: actor.id.slice(0, 64),
    actor_name: actor.name.slice(0, 128),
    target_type: targetType.slice(0, 64),
    target_id: targetId.slice(0, 64),
    target_user_id: (targetType === 'user' ? targetId : String(teamLegacy.target_user_id || '')).slice(0, 64),
    target_name: targetName.slice(0, 128),
    previous_role: teamLegacy.previous_role != null ? String(teamLegacy.previous_role).slice(0, 32) : '',
    new_role: teamLegacy.new_role != null ? String(teamLegacy.new_role).slice(0, 32) : '',
    changed_fields: Array.isArray(teamLegacy.changed_fields)
      ? JSON.stringify(teamLegacy.changed_fields).slice(0, 512)
      : teamLegacy.changed_fields != null
        ? String(teamLegacy.changed_fields).slice(0, 512)
        : '',
    previous_values:
      teamLegacy.previous_values != null ? JSON.stringify(teamLegacy.previous_values).slice(0, 4000) : '',
    new_values: teamLegacy.new_values != null ? JSON.stringify(teamLegacy.new_values).slice(0, 4000) : '',
    timestamp,
    summary,
    domain: domain.slice(0, 32),
    severity: String(input.severity || 'info').slice(0, 16),
    source: String(input.source || '').slice(0, 128),
    ip: String(input.request?.ip || '').slice(0, 64),
    user_agent: String(input.request?.userAgent || '').slice(0, 256),
    payload_json: JSON.stringify(envelope).slice(0, 65535),
  };

  if (input.changes && typeof input.changes === 'object') {
    try {
      const prev = {};
      const next = {};
      for (const [field, delta] of Object.entries(input.changes)) {
        if (delta && typeof delta === 'object') {
          if ('from' in delta) prev[field] = delta.from;
          if ('to' in delta) next[field] = delta.to;
        }
      }
      if (Object.keys(prev).length) doc.previous_values = JSON.stringify(prev).slice(0, 4000);
      if (Object.keys(next).length) doc.new_values = JSON.stringify(next).slice(0, 4000);
    } catch {
      void 0;
    }
  }

  return doc;
}

/**
 * @typedef {object} AuditEventInput
 * @property {string} eventType
 * @property {string} academyId
 * @property {{ type?: string, id?: string, userId?: string, name?: string }} [actor]
 * @property {{ type?: string, id?: string, name?: string }} [target]
 * @property {Record<string, string>} [context]
 * @property {string} [summary]
 * @property {'info'|'warning'|'critical'} [severity]
 * @property {string} [source]
 * @property {Record<string, unknown>} [payload]
 * @property {Record<string, { from?: unknown, to?: unknown }>} [changes]
 * @property {{ ip?: string, userAgent?: string }} [request]
 * @property {string} [timestamp]
 * @property {object} [teamLegacy]
 * @property {{ leadId: string, type: string, text: string, createdBy?: string, payloadJson?: object, at?: string }} [projectToLeadTimeline]
 */

/** @param {AuditEventInput} input */
export async function recordAuditEvent(input) {
  if (!databases || !DB_ID || !ACADEMY_EVENTS_COL) {
    console.warn('[auditLog] collection ou config ausente — evento não gravado');
    return null;
  }

  const academyId = String(input.academyId || '').trim();
  const eventType = String(input.eventType || '').trim();
  if (!academyId || !eventType) return null;

  const doc = mapEnvelopeToAcademyDoc(input);

  try {
    const created = await createDocumentResilient(databases, DB_ID, ACADEMY_EVENTS_COL, ID.unique(), doc, defaultPerms());

    const projection = input.projectToLeadTimeline;
    if (projection?.leadId && projection?.type) {
      addLeadEventServer({
        academyId,
        leadId: projection.leadId,
        type: projection.type,
        text: projection.text || doc.summary || eventType,
        at: projection.at || doc.timestamp,
        createdBy: projection.createdBy || doc.actor_user_id,
        payloadJson: projection.payloadJson || null,
      }).catch((e) => console.warn('[auditLog] Falha na projeção lead_events:', e?.message || e));
    }

    return created;
  } catch (err) {
    console.warn('[auditLog] Falha ao gravar:', err?.message || err);
    return null;
  }
}

/** Lê summary do documento ou payload_json. */
export function formatAuditEventSummary(doc) {
  if (!doc) return '';
  const direct = String(doc.summary || '').trim();
  if (direct) return direct;
  try {
    const parsed = JSON.parse(doc.payload_json || '{}');
    if (parsed.summary) return String(parsed.summary);
  } catch {
    void 0;
  }
  return defaultSummary(String(doc.event_type || ''), {
    actor: { name: doc.actor_name },
    target: { name: doc.target_name },
    payload: {},
  });
}

function buildAuditDeepLink(eventType, doc, envelope) {
  const ctx = envelope?.context || {};
  const target = envelope?.target || {};
  const leadId = String(ctx.lead_id || '').trim();
  const taskId = String(ctx.task_id || target.id || '').trim();
  const t = String(eventType || doc?.event_type || '').trim();

  if (t.startsWith('tasks.') || taskId) return '/tarefas';
  if (t.startsWith('sales.') || t === 'finance.sale_created' || t === 'finance.sale_liquidated') return '/vendas';
  if (t.startsWith('inbox.')) return '/inbox';
  if (leadId) return `/lead/${leadId}`;
  if (t.startsWith('team_member')) return '/equipe';
  if (t.startsWith('finance.') || t.startsWith('finance_') || t.startsWith('bank_')) return '/financeiro';
  if (t.startsWith('inventory_')) return '/estoque';
  return null;
}

/** @param {import('node-appwrite').Models.Document} doc */
export function mapAuditDocToFeedEvent(doc) {
  let envelope = {};
  try {
    envelope = JSON.parse(doc.payload_json || '{}');
  } catch {
    envelope = {};
  }
  const eventType = String(doc.event_type || envelope.event_type || '').trim();
  const domain = auditDomainForEventType(eventType);
  const context = { ...(envelope.context || {}) };
  if (!context.lead_id && envelope.payload?.student_id) {
    context.lead_id = String(envelope.payload.student_id);
  }

  return {
    id: doc.$id,
    occurred_at: doc.timestamp || doc.$createdAt || '',
    event_type: eventType,
    domain,
    domain_label: domain,
    summary: formatAuditEventSummary(doc),
    actor: {
      id: String(doc.actor_user_id || '').trim(),
      name: String(doc.actor_name || '').trim() || 'Sistema',
    },
    target: {
      type: String(doc.target_type || envelope.target?.type || '').trim(),
      id: String(doc.target_id || doc.target_user_id || envelope.target?.id || '').trim(),
      name: String(doc.target_name || envelope.target?.name || '').trim(),
    },
    context,
    link: buildAuditDeepLink(eventType, doc, envelope),
  };
}

/**
 * @param {string} academyId
 * @param {{
 *   limit?: number,
 *   cursor?: string,
 *   fromIso?: string,
 *   toIso?: string,
 *   actorId?: string,
 *   eventType?: string,
 * }} opts
 */
export async function listAuditEventsServer(academyId, opts = {}) {
  if (!databases || !DB_ID || !ACADEMY_EVENTS_COL) {
    return { documents: [], hasMore: false, nextCursor: null };
  }
  const aid = String(academyId || '').trim();
  if (!aid) return { documents: [], hasMore: false, nextCursor: null };

  const lim = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const queries = [
    Query.equal('academy_id', aid),
    Query.orderDesc('timestamp'),
    Query.limit(lim),
  ];
  if (opts.fromIso) queries.push(Query.greaterThanEqual('timestamp', opts.fromIso));
  if (opts.toIso) queries.push(Query.lessThan('timestamp', opts.toIso));
  if (opts.actorId) queries.push(Query.equal('actor_user_id', String(opts.actorId).trim()));
  if (opts.eventType) queries.push(Query.equal('event_type', String(opts.eventType).trim()));
  if (opts.cursor) queries.push(Query.cursorAfter(String(opts.cursor).trim()));

  try {
    const res = await databases.listDocuments(DB_ID, ACADEMY_EVENTS_COL, queries);
    const documents = res.documents || [];
    const lastId = documents.length ? documents[documents.length - 1].$id : null;
    const hasMore = documents.length === lim && Boolean(lastId);
    return { documents, hasMore, nextCursor: hasMore ? lastId : null };
  } catch (err) {
    console.warn('[auditLog] Falha ao listar eventos:', err?.message || err);
    return { documents: [], hasMore: false, nextCursor: null };
  }
}

/** @param {import('node-appwrite').Models.Document} academyDoc @param {import('node-appwrite').Models.User} me */
export async function resolveAuditFeedScope(academyDoc, me, isOwnerOrAdminFn) {
  const isPrivileged = await isOwnerOrAdminFn(academyDoc, me);
  return {
    scope: isPrivileged ? 'all' : 'self',
    actorId: String(me?.$id || '').trim(),
  };
}
