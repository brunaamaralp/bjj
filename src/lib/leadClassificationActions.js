import { LEAD_STATUS } from './leadStatus.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';

/**
 * @typedef {'schedule_trial'|'send_schedules'|'assume_inbox'|'move_to_trial_stage'|'link_student'} SuggestedActionId
 */

/**
 * @param {object|null|undefined} lead
 * @param {{ terms?: object, mapLeadToStageId?: (l: object) => string }} [opts]
 * @returns {{ id: SuggestedActionId, label: string } | null}
 */
export function getPrimarySuggestedLeadAction(lead, opts = {}) {
  if (!lead) return null;
  const terms = opts.terms || {};
  const trialShort = String(terms.trialShort || 'Experimental').trim();
  const student = String(terms.student || 'Aluno').trim();
  const intention = String(lead.intention || lead.whatsapp_intention || '').trim();
  const stage = String(
    lead.pipelineStage || (typeof opts.mapLeadToStageId === 'function' ? opts.mapLeadToStageId(lead) : '')
  ).trim();
  const phone = String(lead.phone || '').replace(/\D/g, '');

  if (lead.needHuman && phone) {
    return { id: 'assume_inbox', label: 'Assumir conversa' };
  }

  if (intention === 'aluno_atual' || lead.whatsappContactType === 'aluno') {
    return { id: 'link_student', label: `Vincular ${student.toLowerCase()}` };
  }

  if (intention === 'aula_experimental' && !lead.scheduledDate) {
    return { id: 'schedule_trial', label: `Agendar ${trialShort.toLowerCase()}` };
  }

  if (intention.startsWith('horarios_')) {
    return { id: 'send_schedules', label: 'Enviar horários' };
  }

  if (lead.hotLead && stage === 'Novo') {
    return { id: 'move_to_trial_stage', label: `Mover para ${trialShort}` };
  }

  if (intention === 'aula_experimental' && !lead.scheduledDate) {
    return { id: 'schedule_trial', label: `Agendar ${trialShort.toLowerCase()}` };
  }

  return null;
}

/**
 * @param {object|null|undefined} lead
 * @param {{ terms?: object, mapLeadToStageId?: (l: object) => string }} [opts]
 * @returns {Array<{ id: SuggestedActionId, label: string }>}
 */
export function getSuggestedLeadActions(lead, opts = {}) {
  const primary = getPrimarySuggestedLeadAction(lead, opts);
  return primary ? [primary] : [];
}

export function canSuggestMoveToTrialStage(lead, stage) {
  if (!lead?.hotLead) return false;
  const s = String(stage || '').trim();
  return s === 'Novo' || s === LEAD_STATUS.NEW || !s;
}

export { PIPELINE_WAITING_DECISION_STAGE };
