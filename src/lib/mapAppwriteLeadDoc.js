import { LEAD_STATUS } from './leadStatus.js';

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
 * Mapeia documento Appwrite (leads) → objeto usado na UI (camelCase).
 * @param {object} doc
 * @param {Set<string>} operationalStatusSet
 */
export function mapAppwriteDocToLead(doc, operationalStatusSet) {
  const fromStage = String(doc.pipeline_stage || '').trim();
  const status = operationalStatusSet.has(doc.status) ? doc.status : LEAD_STATUS.NEW;
  const effectivePipelineStage =
    fromStage || (operationalStatusSet.has(doc.status) ? '' : doc.status) || 'Novo';

  const whatsappLeadQuenteRaw = String(doc.whatsapp_lead_quente || '').trim().toLowerCase();
  const hotLead = whatsappLeadQuenteRaw === 'sim';

  return {
    id: doc.$id,
    name: doc.name,
    phone: doc.phone,
    type: doc.type || 'Adulto',
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
    createdAt: doc.$createdAt,
    lostReason: doc.lostReason || '',
    plan: doc.plan || '',
    enrollmentDate: doc.enrollmentDate || '',
    emergencyContact: doc.emergencyContact || '',
    emergencyPhone: doc.emergencyPhone || '',
    cpf: doc.cpf || '',
    responsavel: doc.responsavel || '',
    preferredPaymentMethod: doc.preferred_payment_method || '',
    preferredPaymentAccount: doc.preferred_payment_account || '',
    labelIds: Array.isArray(doc.label_ids) ? doc.label_ids : []
  };
}
