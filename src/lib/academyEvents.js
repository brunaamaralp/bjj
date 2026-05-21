/**
 * Padrão de evento de auditoria (academy_events):
 * { event_type, academy_id, actor_user_id, actor_name,
 *   target_id?, target_name?, previous_value?, new_value?, timestamp }
 * Nomenclatura: módulo_ação — ex.: team_member_added, student_deactivated
 *
 * Gravação ocorre no servidor (lib/server/academyEvents.js).
 * Env: VITE_APPWRITE_ACADEMY_EVENTS_COLLECTION_ID
 */

export const TEAM_EVENT_TYPES = {
  ADDED: 'team_member_added',
  REMOVED: 'team_member_removed',
  UPDATED: 'team_member_updated',
  PASSWORD_RESET: 'team_member_password_reset',
};
