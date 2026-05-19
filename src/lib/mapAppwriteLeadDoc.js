import { LEAD_STATUS } from './leadStatus.js';
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

function parsePendingAutomations(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        key: String(x.key || '').trim(),
        sendAt: String(x.sendAt || '').trim(),
        sent: x.sent === true,
      }))
      .filter((x) => x.key && x.sendAt);
  } catch {
    return [];
  }
}

/**
 * Mapeia documento Appwrite (leads) → objeto usado na UI (camelCase).
 * @param {object} doc
 * @param {Set<string>} operationalStatusSet
 */
export function mapAppwriteDocToLead(doc, operationalStatusSet) {
  const dueDayRaw = Number(doc.due_day ?? doc.dueDay ?? 0);
  const dueDay = Number.isFinite(dueDayRaw) && dueDayRaw >= 1 && dueDayRaw <= 31 ? Math.trunc(dueDayRaw) : null;

  const fromStage = String(doc.pipeline_stage || '').trim();
  const status = operationalStatusSet.has(doc.status) ? doc.status : LEAD_STATUS.NEW;
  const effectivePipelineStage =
    fromStage || (operationalStatusSet.has(doc.status) ? '' : doc.status) || 'Novo';

  const whatsappLeadQuenteRaw = String(doc.whatsapp_lead_quente || '').trim().toLowerCase();
  const hotLead = whatsappLeadQuenteRaw === 'sim';

  const turmaRaw = String(doc.turma ?? doc.class_name ?? doc.className ?? '').trim();

  return {
    id: doc.$id,
    name: doc.name,
    phone: doc.phone,
    type: doc.type || 'Adulto',
    turma: turmaRaw,
    className: turmaRaw,
    sexo: normalizeSexo(doc.sexo),
    origin: doc.origin || '',
    contact_type: doc.contact_type ?? 'lead',
    status,
    pipelineStage: effectivePipelineStage,
    scheduledDate: doc.scheduledDate || '',
    scheduledTime: doc.scheduledTime || '',
    parentName: doc.parentName || '',
    age: doc.age || '',
    birthDate: doc.birth_date || doc.birthDate || '',
    /**
     * DEPRECATED: notes será removido após validação.
     * Não usar em código novo — timeline em lead_events.
     */
    notes: [],
    isFirstExperience: doc.is_first_experience || 'Sim',
    belt: doc.belt || '',
    customAnswers: parseCustomAnswersJson(doc.custom_answers_json),
    intention: doc.whatsapp_intention || '',
    priority: doc.whatsapp_priority || '',
    hotLead,
    needHuman: Boolean(doc.need_human),
    statusChangedAt: doc.status_changed_at || doc.statusChangedAt || '',
    pipelineStageChangedAt: doc.pipeline_stage_changed_at || doc.$createdAt || '',
    attendedAt: doc.attended_at || null,
    missedAt: doc.missed_at || null,
    lostAt: doc.lost_at || null,
    convertedAt: doc.converted_at || null,
    importedAt: doc.imported_at || null,
    lastNoteAt: doc.last_note_at || null,
    lastWhatsappActivityAt: doc.last_whatsapp_activity_at || null,
    whatsappClassifiedAt: doc.whatsapp_classified_at || null,
    pendingAutomations: parsePendingAutomations(doc.pending_automations),
    hasPendingAutomations: doc.has_pending_automations === true,
    createdAt: doc.$createdAt,
    lostReason: doc.lostReason || '',
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
