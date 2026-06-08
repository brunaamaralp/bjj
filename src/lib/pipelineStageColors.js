import { LEAD_STATUS } from '../store/useLeadStore';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';

/** Cores estáveis por id de etapa — badges com fundo em opacidade (design system Nave). */
const STAGE_COLOR_BY_ID = {
  Novo: { color: '#000435', bg: 'rgba(117, 84, 104, 0.12)' },
  'Aula experimental': { color: '#8A6020', bg: 'rgba(228, 181, 93, 0.15)' },
  [LEAD_STATUS.MISSED]: { color: '#CC4444', bg: 'rgba(255, 128, 128, 0.12)' },
  [PIPELINE_WAITING_DECISION_STAGE]: { color: '#4A2FA3', bg: 'rgba(108, 71, 216, 0.12)' },
  Matriculado: { color: '#085041', bg: 'rgba(31, 170, 94, 0.12)' },
  [LEAD_STATUS.LOST]: { color: '#4A3040', bg: 'rgba(117, 84, 104, 0.12)' },
};

const STAGE_COLOR_FALLBACK = [
  { color: '#000435', bg: 'rgba(117, 84, 104, 0.12)' },
  { color: '#8A6020', bg: 'rgba(228, 181, 93, 0.15)' },
  { color: '#085041', bg: 'rgba(31, 170, 94, 0.12)' },
  { color: '#4A3040', bg: 'rgba(117, 84, 104, 0.12)' },
];

export function getPipelineStageColor(stageId, fallbackIndex = 0) {
  const key = String(stageId || '').trim();
  if (STAGE_COLOR_BY_ID[key]) return STAGE_COLOR_BY_ID[key];
  const idx = Number(fallbackIndex);
  const safeIndex = Number.isFinite(idx) && idx >= 0 ? idx : 0;
  return STAGE_COLOR_FALLBACK[safeIndex % STAGE_COLOR_FALLBACK.length];
}
