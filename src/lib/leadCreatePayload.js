import { LEAD_STATUS } from './leadStatus.js';

/** Atributos que nunca devem ir para createDocument na coleção leads. */
export const LEAD_CREATE_FORBIDDEN_KEYS = new Set([
  'notes',
  'contact_type',
  'id',
  'createdAt',
  'intention',
  'priority',
  'hotLead',
  '_isNew',
  '_localKanbanIndex',
  'whatsappClassifiedAt',
  'initialNote',
]);

/**
 * Observação inicial do formulário → eventos lead_events (não grava em leads.notes).
 * Aceita `initialNote` (string) ou legado `notes` (array).
 */
export function extractInitialNoteEvents(lead, nowIso = new Date().toISOString()) {
  const direct = String(lead?.initialNote || '').trim();
  if (direct) {
    return [{ type: 'note', text: direct.slice(0, 1000), at: nowIso, by: 'user' }];
  }
  const out = [];
  for (const ev of lead?.notes || []) {
    if (ev && ev.type === 'note' && String(ev.text || '').trim()) {
      out.push(ev);
    }
  }
  return out;
}

/**
 * Payload whitelist para databases.createDocument(leads).
 * @param {object} lead — entrada da UI (pode conter campos só de cliente)
 * @param {{ academyId: string, nowIso?: string, turmaAttrKey?: string|null }} ctx
 */
export function buildLeadCreateDocumentPayload(lead, { academyId, nowIso = new Date().toISOString(), turmaAttrKey = null }) {
  const payload = {
    name: String(lead?.name || '').trim(),
    phone: String(lead?.phone || '').trim(),
    type: lead?.type || 'Adulto',
    origin: String(lead?.origin || ''),
    status: lead?.status || LEAD_STATUS.NEW,
    scheduledDate: String(lead?.scheduledDate || ''),
    scheduledTime: String(lead?.scheduledTime || ''),
    parentName: String(lead?.parentName || ''),
    age: lead?.age != null && lead?.age !== '' ? String(lead.age) : '',
    academyId: String(academyId || '').trim(),
    is_first_experience: lead?.isFirstExperience || 'Sim',
    belt: lead?.belt || '',
    custom_answers_json: JSON.stringify(lead?.customAnswers || {}),
    birth_date: String(lead?.birthDate || '').slice(0, 10),
    pipeline_stage: lead?.pipelineStage || 'Novo',
    pipeline_stage_changed_at: nowIso,
    status_changed_at: nowIso,
  };

  if (lead?.sexo) {
    payload.sexo = String(lead.sexo).trim().slice(0, 16);
  }
  if (turmaAttrKey && lead?.turma) {
    payload[turmaAttrKey] = String(lead.turma).trim().slice(0, 128);
  }

  for (const key of LEAD_CREATE_FORBIDDEN_KEYS) {
    delete payload[key];
  }

  return payload;
}
