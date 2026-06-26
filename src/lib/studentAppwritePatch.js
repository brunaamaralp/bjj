import { parseUnknownAttributeFromMessage } from './appwriteErrors.js';

/** Atributos opcionais em students — podem não existir até provisionar. */
export const OPTIONAL_STUDENT_PATCH_ATTRS = [
  'email',
  'discount_amount',
  'discount_type',
  'preferred_payment_method',
  'preferred_payment_account',
  'due_day',
  'dueDay',
  'plan_billing',
  'photo_url',
  'freeze_start',
  'freeze_end',
  'freeze_status',
  'freeze_days_used',
  'freeze_quota_year',
  'device_id',
  'controlid_user_id',
  'controlid_synced',
  'controlid_sync_error',
  'birth_date',
  'sexo',
  'cpf',
  'responsavel',
  'email_responsavel',
  'cpf_responsavel',
  'payer_aliases_json',
  'custom_answers_json',
  'exit_reason',
  'exit_date',
];

export function stripUnknownStudentPatch(patch, errorMessage = '') {
  const lean = { ...patch };
  const msg = String(errorMessage || '');
  const unknown = parseUnknownAttributeFromMessage(msg);
  if (unknown && Object.prototype.hasOwnProperty.call(lean, unknown)) {
    delete lean[unknown];
    return lean;
  }
  if (/unknown attribute/i.test(msg)) {
    for (const key of OPTIONAL_STUDENT_PATCH_ATTRS) {
      delete lean[key];
    }
  }
  return lean;
}
