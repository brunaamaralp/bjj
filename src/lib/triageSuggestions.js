import { intentionDisplayLabel } from './whatsappClassificationLabels.js';

/**
 * Sugestão de triagem com base na classificação do agente WhatsApp.
 * @typedef {'confirm'|'link_student'|'dismiss'} TriageSuggestionId
 */

/**
 * @param {object|null|undefined} lead
 * @returns {TriageSuggestionId}
 */
export function suggestTriageAction(lead) {
  if (!lead) return 'confirm';

  const intention = String(lead.intention || lead.whatsapp_intention || '').trim();
  const contactType = String(lead.whatsappContactType || lead.whatsapp_contact_type || '').trim();

  if (contactType === 'aluno' || intention === 'aluno_atual') {
    return 'link_student';
  }

  if (intention === 'aviso_sem_pergunta') {
    return 'dismiss';
  }

  if (contactType === 'lead' && lead.hotLead) {
    return 'confirm';
  }

  return 'confirm';
}

/**
 * @param {object|null|undefined} lead
 * @param {{ terms?: object, labels?: object }} [opts]
 */
export function triageContextLine(lead, opts = {}) {
  if (!lead?.intention && !lead?.whatsapp_intention) return '';
  const label = intentionDisplayLabel(lead.intention || lead.whatsapp_intention, opts);
  if (!label) return '';
  return `IA identificou: ${label}`;
}
