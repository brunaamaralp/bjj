import { LEAD_STATUS } from '../store/useLeadStore';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';

/** Cores estáveis por id de etapa (não mudam ao reordenar colunas). */
const STAGE_COLOR_BY_ID = {
  Novo: { color: 'var(--petroleo)', bg: 'var(--accent-light)' },
  'Aula experimental': { color: 'var(--dourado)', bg: 'var(--warning-light)' },
  [LEAD_STATUS.MISSED]: { color: 'var(--danger)', bg: 'var(--danger-light)' },
  [PIPELINE_WAITING_DECISION_STAGE]: { color: 'var(--petroleo)', bg: 'color-mix(in srgb, var(--petroleo) 12%, var(--branco))' },
  Matriculado: { color: 'var(--cosmos)', bg: 'var(--success-light)' },
  [LEAD_STATUS.LOST]: { color: 'var(--ameixa)', bg: 'color-mix(in srgb, var(--ameixa) 12%, var(--branco))' },
};

const STAGE_COLOR_FALLBACK = [
  { color: 'var(--petroleo)', bg: 'var(--accent-light)' },
  { color: 'var(--dourado)', bg: 'var(--warning-light)' },
  { color: 'var(--petroleo)', bg: 'color-mix(in srgb, var(--petroleo) 12%, var(--branco))' },
  { color: 'var(--cosmos)', bg: 'var(--success-light)' },
];

export function getPipelineStageColor(stageId, fallbackIndex = 0) {
  const key = String(stageId || '').trim();
  if (STAGE_COLOR_BY_ID[key]) return STAGE_COLOR_BY_ID[key];
  return STAGE_COLOR_FALLBACK[fallbackIndex % STAGE_COLOR_FALLBACK.length];
}
