import { LEAD_STATUS } from '../store/useLeadStore';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';

const SCHEDULE_SHORTCUT_STAGE_IDS = new Set(['Novo', 'Contato feito', 'Tentativa de contato']);

const SCHEDULE_SHORTCUT_HIDDEN = new Set([
  PIPELINE_WAITING_DECISION_STAGE,
  'Aguardando decisão',
  'Matriculado',
  LEAD_STATUS.LOST,
  'Perdido',
  'Perdidos',
  'Aula experimental',
  LEAD_STATUS.MISSED,
  'Não compareceu',
]);

/**
 * Atalho "Agendar" no card do Pipeline — etapas iniciais do funil apenas.
 */
export function canShowPipelineScheduleShortcut(lead, mapLeadToStageId) {
  if (!lead || lead._isStudent) return false;
  if (lead.status === LEAD_STATUS.LOST || lead.status === LEAD_STATUS.CONVERTED) return false;

  const raw = String(lead.pipelineStage || lead.stage || '').trim();
  const colId = typeof mapLeadToStageId === 'function' ? String(mapLeadToStageId(lead) || '').trim() : raw;

  if (SCHEDULE_SHORTCUT_HIDDEN.has(raw) || SCHEDULE_SHORTCUT_HIDDEN.has(colId)) return false;
  if (SCHEDULE_SHORTCUT_STAGE_IDS.has(raw)) return true;
  if (SCHEDULE_SHORTCUT_STAGE_IDS.has(colId)) return true;
  if (!raw && colId === 'Novo') return true;

  return false;
}
