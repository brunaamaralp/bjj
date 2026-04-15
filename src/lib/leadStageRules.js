import { LEAD_STATUS } from './leadStatus.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';

/**
 * Dado um pipelineStage (id da coluna do Kanban), retorna o status canônico.
 * Pipeline e Dashboard usam isso para manter status e pipelineStage alinhados.
 */
export const STAGE_TO_STATUS = {
  Novo: LEAD_STATUS.NEW,
  'Novo lead': LEAD_STATUS.NEW,
  'Em contato': LEAD_STATUS.NEW,
  'Contato feito': LEAD_STATUS.NEW,
  'Aula experimental': LEAD_STATUS.SCHEDULED,
  [PIPELINE_WAITING_DECISION_STAGE]: LEAD_STATUS.COMPLETED,
  Matriculado: LEAD_STATUS.CONVERTED,
  Negociação: LEAD_STATUS.CONVERTED,
  [LEAD_STATUS.MISSED]: LEAD_STATUS.MISSED,
  [LEAD_STATUS.LOST]: LEAD_STATUS.LOST,
};

/**
 * @param {string} pipelineStage
 * @returns {Record<string, unknown>}
 */
export function getStageUpdatePayload(pipelineStage) {
  const status = STAGE_TO_STATUS[pipelineStage];
  if (!status) {
    console.warn('[leadStageRules] pipelineStage sem status canônico:', pipelineStage);
    return { pipelineStage };
  }
  return { pipelineStage, status };
}

function hasExperimentalCalendarDate(lead) {
  const ymd = String(lead?.scheduledDate || '').trim().split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd);
}

/**
 * Critério único para lead aparecer na agenda experimental (recepção).
 */
export function isLeadScheduledForExperimental(lead) {
  return (
    lead?.status === LEAD_STATUS.SCHEDULED &&
    hasExperimentalCalendarDate(lead) &&
    String(lead?.origin || '').trim() !== 'Planilha' &&
    lead?.status !== LEAD_STATUS.CONVERTED &&
    String(lead?.pipelineStage || '').trim() !== 'Matriculado' &&
    lead?.contact_type !== 'student'
  );
}
