import { LEAD_STATUS } from './leadStatus.js';
import { normalizeSexo } from './leadSexo.js';
import { pipelineStageFromLeadStatus } from './leadStageRules.js';
import { parsePendingAutomations } from '../../lib/automationCore.js';

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
  const effectivePipelineStage = fromStage || pipelineStageFromLeadStatus(status);

  const whatsappLeadQuenteRaw = String(doc.whatsapp_lead_quente || '').trim().toLowerCase();
  const hotLead = whatsappLeadQuenteRaw === 'sim';

  return {
    id: doc.$id,
    name: doc.name,
    phone: doc.phone || doc.phone_number || '',
    type: doc.type || 'Adulto',
    sexo: normalizeSexo(doc.sexo),
    turma: String(doc.turma || doc.class_name || '').trim(),
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
    whatsappContactType: String(doc.whatsapp_contact_type || '').trim(),
    whatsappLeadProfile: String(doc.whatsapp_lead_profile || '').trim(),
    pendingAutomations: parsePendingAutomations(doc.pending_automations),
    hasPendingAutomations: doc.has_pending_automations === true,
    createdAt: doc.$createdAt,
    lostReason: doc.lostReason || '',
    triageStatus: String(doc.triage_status || '').trim(),
    inboundAuto: doc.inbound_auto === true || String(doc.inbound_auto || '').trim().toLowerCase() === 'true',
  };
}
