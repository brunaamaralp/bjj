import { parseUnknownAttributeFromMessage } from './appwriteErrors.js';

/** Atributos opcionais em leads — podem não existir até provisionar. */
export const OPTIONAL_LEAD_PATCH_ATTRS = [
  'status_changed_at',
  'pipeline_stage_changed_at',
  'pending_automations',
  'has_pending_automations',
  'attended_at',
  'missed_at',
  'missed_reason',
  'lost_at',
  'imported_at',
  'last_note_at',
  'last_whatsapp_activity_at',
  'triage_status',
  'inbound_auto',
  'need_human',
  'whatsapp_intention',
  'whatsapp_priority',
  'whatsapp_lead_quente',
  'whatsapp_classified_at',
  'birth_date',
  'sexo',
  'belt',
  'custom_answers_json',
  'is_first_experience',
  'ai_history_summary_json',
  'preferred_payment_method',
  'preferred_payment_account',
  'turma',
  'class_name',
];

export function stripUnknownLeadPatch(patch, errorMessage = '') {
  const lean = { ...patch };
  const msg = String(errorMessage || '');
  const unknown = parseUnknownAttributeFromMessage(msg);
  if (unknown && Object.prototype.hasOwnProperty.call(lean, unknown)) {
    delete lean[unknown];
    return lean;
  }
  if (/unknown attribute/i.test(msg)) {
    for (const key of OPTIONAL_LEAD_PATCH_ATTRS) {
      delete lean[key];
    }
  }
  return lean;
}
