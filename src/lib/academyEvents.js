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
 * Eventos de equipe (gravados no servidor — lib/server/academyEvents.js):
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
 * Env: VITE_APPWRITE_ACADEMY_EVENTS_COLLECTION_ID
 */

export const TEAM_EVENT_TYPES = {
  ADDED: 'team_member_added',
  REMOVED: 'team_member_removed',
  UPDATED: 'team_member_updated',
  PASSWORD_RESET: 'team_member_password_reset',
};
