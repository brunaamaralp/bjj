import { normalizeStudentStatus } from './studentStatus.js';
import { normalizeSexo } from './leadSexo.js';

function parseCustomAnswersJson(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/**
 * Mapeia documento Appwrite (students) → objeto UI (camelCase).
 * @param {object} doc
 */
export function mapAppwriteDocToStudent(doc) {
  const dueDayRaw = Number(doc.due_day ?? doc.dueDay ?? 0);
  const dueDay = Number.isFinite(dueDayRaw) && dueDayRaw >= 1 && dueDayRaw <= 31 ? Math.trunc(dueDayRaw) : null;
  const turmaRaw = String(doc.turma ?? doc.class_name ?? doc.className ?? '').trim();

  return {
    id: doc.$id,
    _isStudent: true,
    name: doc.name,
    phone: doc.phone,
    type: doc.type || 'Adulto',
    turma: turmaRaw,
    className: turmaRaw,
    sexo: normalizeSexo(doc.sexo),
    origin: doc.source_origin || doc.origin || '',
    sourceOrigin: doc.source_origin || doc.origin || '',
    status: 'Matriculado',
    contact_type: 'student',
    pipelineStage: 'Matriculado',
    parentName: doc.parentName || '',
    age: doc.age || '',
    birthDate: doc.birth_date || doc.birthDate || '',
    notes: [],
    isFirstExperience: doc.is_first_experience || 'Sim',
    belt: doc.belt || '',
    customAnswers: parseCustomAnswersJson(doc.custom_answers_json),
    createdAt: doc.$createdAt,
    convertedAt: doc.converted_at || doc.convertedAt || null,
    plan: doc.plan || '',
    dueDay,
    enrollmentDate: doc.enrollmentDate || '',
    emergencyContact: doc.emergencyContact || '',
    emergencyPhone: doc.emergencyPhone || '',
    cpf: doc.cpf || '',
    responsavel: doc.responsavel || '',
    cpfResponsavel: doc.cpf_responsavel || doc.cpfResponsavel || '',
    preferredPaymentMethod: doc.preferred_payment_method || '',
    preferredPaymentAccount: doc.preferred_payment_account || '',
    labelIds: Array.isArray(doc.label_ids) ? doc.label_ids : [],
    studentStatus: normalizeStudentStatus(doc.student_status ?? doc.studentStatus),
    exitReason: String(doc.exit_reason ?? doc.exitReason ?? '').trim(),
    exitDate: String(doc.exit_date ?? doc.exitDate ?? '').trim().slice(0, 10),
    device_id: doc.device_id != null ? Number(doc.device_id) : null,
    controlid_user_id: doc.controlid_user_id != null ? Number(doc.controlid_user_id) : null,
    controlid_synced: doc.controlid_synced === true,
    controlid_sync_error: String(doc.controlid_sync_error || '').trim() || null,
    photo_url: String(doc.photo_url || doc.photoUrl || '').trim() || null,
    plan_billing: String(doc.plan_billing || doc.planBilling || '').trim() || null,
    freeze_start: doc.freeze_start || null,
    freeze_end: doc.freeze_end || null,
    freeze_days_used: Number(doc.freeze_days_used ?? doc.freezeDaysUsed ?? 0) || 0,
    freeze_status: doc.freeze_status || doc.freezeStatus || null,
    freeze_quota_year: String(doc.freeze_quota_year || doc.freezeQuotaYear || '').trim() || null,
  };
}
