import { LEAD_STATUS } from '../store/useLeadStore';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';

/** Cores estáveis por id de etapa (não mudam ao reordenar colunas). */
const STAGE_COLOR_BY_ID = {
  Novo: { color: 'var(--accent)', bg: 'var(--accent-light)' },
  'Aula experimental': { color: 'var(--warning)', bg: 'var(--warning-light)' },
  [LEAD_STATUS.MISSED]: { color: 'var(--danger)', bg: 'var(--danger-light)' },
  [PIPELINE_WAITING_DECISION_STAGE]: { color: 'var(--v500)', bg: 'rgba(99, 102, 241, 0.12)' },
  Matriculado: { color: 'var(--success)', bg: 'var(--success-light)' },
  [LEAD_STATUS.LOST]: { color: 'var(--purple)', bg: 'var(--purple-light)' },
};

const STAGE_COLOR_FALLBACK = [
  { color: 'var(--accent)', bg: 'var(--accent-light)' },
  { color: 'var(--warning)', bg: 'var(--warning-light)' },
  { color: 'var(--v500)', bg: 'rgba(99, 102, 241, 0.12)' },
  { color: 'var(--success)', bg: 'var(--success-light)' },
];

export function getPipelineStageColor(stageId, fallbackIndex = 0) {
  const key = String(stageId || '').trim();
  if (STAGE_COLOR_BY_ID[key]) return STAGE_COLOR_BY_ID[key];
  return STAGE_COLOR_FALLBACK[fallbackIndex % STAGE_COLOR_FALLBACK.length];
}
