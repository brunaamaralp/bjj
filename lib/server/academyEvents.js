/**
 * Padrão de evento de auditoria (academy_events):
 * {
 *   event_type, academy_id, actor_user_id, actor_name,
 *   target_id?, target_name?, previous_value?, new_value?,
 *   timestamp
 * }
 * Nomenclatura: módulo_ação
 * ex.: team_member_added, student_deactivated, config_plan_changed, contract_sent
 *
 * Eventos de equipe (campos adicionais em documento + payload_json):
 * {
 *   event_type,           // team_member_added | team_member_removed | ...
 *   academy_id,
 *   actor_user_id,
 *   actor_name,
 *   target_user_id,
 *   target_name,
 *   previous_role,        // em removed, updated
 *   new_role,             // em added, updated
 *   changed_fields,       // em updated: array de campos alterados
 *   previous_values,      // em updated: valores anteriores
 *   new_values,           // em updated: valores novos
 *   timestamp
 * }
 * Nunca gravar senhas nem hashes em nenhum evento.
 *
 * Env: APPWRITE_ACADEMY_EVENTS_COLLECTION_ID ou VITE_APPWRITE_ACADEMY_EVENTS_COLLECTION_ID
 */
import { Client, Databases, Query } from 'node-appwrite';
import { recordAuditEvent, legacyAcademyEventToInput } from './auditLog.js';
import {
  TEAM_EVENT_TYPES,
  INVENTORY_EVENT_TYPES,
  FINANCE_RECURRENCE_EVENT_TYPES,
  BANK_RECONCILIATION_EVENT_TYPES,
} from './auditEventTypes.js';

export { TEAM_EVENT_TYPES, INVENTORY_EVENT_TYPES, FINANCE_RECURRENCE_EVENT_TYPES, BANK_RECONCILIATION_EVENT_TYPES };

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

const adminClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = adminClient ? new Databases(adminClient) : null;

/**
 * Adapter legado → recordAuditEvent (Fase 1).
 * @param {object} event
 */
export async function recordAcademyEvent(event) {
  return recordAuditEvent(legacyAcademyEventToInput(event));
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

const TEAM_EVENT_TYPE_VALUES = Object.values(TEAM_EVENT_TYPES);

/** Eventos de equipe apenas (convites, papéis, remoções). */
export async function listTeamAcademyEventsServer(academyId, { limit = 10, offset = 0 } = {}) {
  if (!databases || !DB_ID || !ACADEMY_EVENTS_COL) return { documents: [], total: 0 };
  const aid = String(academyId || '').trim();
  if (!aid) return { documents: [], total: 0 };

  const lim = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const off = Math.max(Number(offset) || 0, 0);

  const res = await databases.listDocuments(DB_ID, ACADEMY_EVENTS_COL, [
    Query.equal('academy_id', aid),
    Query.equal('event_type', TEAM_EVENT_TYPE_VALUES),
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
