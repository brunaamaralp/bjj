/**
 * Padrão de evento de auditoria (academy_events):
 * {
 *   event_type, academy_id, actor_user_id, actor_name,
 *   target_id?, target_name?, previous_value?, new_value?,
 *   timestamp, payload_json?
 * }
 * Nomenclatura: módulo_ação
 * ex.: team_member_added, student_deactivated, config_plan_changed, contract_sent
 *
 * Env: APPWRITE_ACADEMY_EVENTS_COLLECTION_ID ou VITE_APPWRITE_ACADEMY_EVENTS_COLLECTION_ID
 */
import { Client, Databases, Permission, Role, ID, Query } from 'node-appwrite';

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

export const TEAM_EVENT_TYPES = {
  ADDED: 'team_member_added',
  REMOVED: 'team_member_removed',
  UPDATED: 'team_member_updated',
  PASSWORD_RESET: 'team_member_password_reset',
};

export const INVENTORY_EVENT_TYPES = {
  RESTOCK_TASK_CREATED: 'inventory_restock_task_created',
  RESTOCK_TASK_UPDATED: 'inventory_restock_task_updated',
};

const adminClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = adminClient ? new Databases(adminClient) : null;

function defaultPerms() {
  return [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
}

/**
 * @param {object} event
 */
export async function recordAcademyEvent(event) {
  if (!databases || !DB_ID || !ACADEMY_EVENTS_COL) {
    console.warn('[academyEvents] collection ou config ausente — evento não gravado');
    return null;
  }

  const academyId = String(event.academy_id || '').trim();
  const eventType = String(event.event_type || '').trim();
  if (!academyId || !eventType) return null;

  const safePayload = { ...event };
  delete safePayload.password;
  delete safePayload.tempPassword;
  delete safePayload.passwordHash;

  const doc = {
    academy_id: academyId,
    event_type: eventType.slice(0, 64),
    actor_user_id: String(event.actor_user_id || 'system').slice(0, 64),
    actor_name: String(event.actor_name || '').slice(0, 128),
    target_user_id: String(event.target_user_id || '').slice(0, 64),
    target_name: String(event.target_name || '').slice(0, 128),
    previous_role: event.previous_role != null ? String(event.previous_role).slice(0, 32) : '',
    new_role: event.new_role != null ? String(event.new_role).slice(0, 32) : '',
    changed_fields: Array.isArray(event.changed_fields) ? JSON.stringify(event.changed_fields).slice(0, 512) : '',
    previous_values: event.previous_values != null ? JSON.stringify(event.previous_values).slice(0, 4000) : '',
    new_values: event.new_values != null ? JSON.stringify(event.new_values).slice(0, 4000) : '',
    timestamp: event.timestamp || new Date().toISOString(),
    payload_json: JSON.stringify(safePayload).slice(0, 65535),
  };

  try {
    return await databases.createDocument(DB_ID, ACADEMY_EVENTS_COL, ID.unique(), doc, defaultPerms());
  } catch (err) {
    console.warn('[academyEvents] Falha ao gravar:', err?.message || err);
    return null;
  }
}

export async function listAcademyEventsServer(academyId, { limit = 10, offset = 0 } = {}) {
  if (!databases || !DB_ID || !ACADEMY_EVENTS_COL) return { documents: [], total: 0 };
  const aid = String(academyId || '').trim();
  if (!aid) return { documents: [], total: 0 };

  const lim = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const off = Math.max(Number(offset) || 0, 0);

  const res = await databases.listDocuments(DB_ID, ACADEMY_EVENTS_COL, [
    Query.equal('academy_id', aid),
    Query.orderDesc('timestamp'),
    Query.limit(lim),
    Query.offset(off),
  ]);

  return { documents: res.documents || [], total: res.total || 0 };
}

export function formatTeamEventDescription(event, actorNameFallback = 'Alguém') {
  const actor = String(event.actor_name || actorNameFallback).trim() || actorNameFallback;
  const target = String(event.target_name || 'membro').trim() || 'membro';
  const type = String(event.event_type || '').trim();
  const newRole = String(event.new_role || '').trim();
  const prevRole = String(event.previous_role || '').trim();

  switch (type) {
    case TEAM_EVENT_TYPES.ADDED:
      return `${actor} adicionou ${target}${newRole ? ` como ${newRole}` : ''}`;
    case TEAM_EVENT_TYPES.REMOVED:
      return `${actor} removeu ${target} da equipe`;
    case TEAM_EVENT_TYPES.UPDATED: {
      let fields = [];
      try {
        fields = JSON.parse(event.changed_fields || '[]');
      } catch {
        fields = [];
      }
      if (fields.includes('role') && prevRole && newRole) {
        return `${actor} alterou o papel de ${target} de ${prevRole} para ${newRole}`;
      }
      if (fields.includes('email')) {
        return `${actor} alterou o e-mail de ${target}`;
      }
      return `${actor} atualizou os dados de ${target}`;
    }
    case TEAM_EVENT_TYPES.PASSWORD_RESET:
      return `${actor} enviou e-mail de redefinição de senha para ${target}`;
    default:
      return `${actor} — ${type}`;
  }
}
