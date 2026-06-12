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

/** Colunas padrão do funil — status operacional prevalece sobre pipeline_stage desatualizado. */
export const CANONICAL_PIPELINE_STAGE_IDS = new Set([
  'Novo',
  'Aula experimental',
  PIPELINE_WAITING_DECISION_STAGE,
  'Matriculado',
  LEAD_STATUS.MISSED,
  LEAD_STATUS.LOST,
]);

export function normalizePipelineStageId(stageId) {
  const id = String(stageId ?? '').trim();
  if (!id) return '';
  if (id.toLowerCase() === 'novo') return 'Novo';
  return id;
}

/** Deriva a coluna do funil a partir do status operacional do lead. */
/** Lead ainda em captação ou com experimental marcada — sempre visível no funil. */
export function isOpenFunnelLead(lead) {
  const status = String(lead?.status || '').trim();
  return status === LEAD_STATUS.NEW || status === LEAD_STATUS.SCHEDULED;
}

export function pipelineStageFromLeadStatus(status) {
  const direct = {
    [LEAD_STATUS.NEW]: 'Novo',
    [LEAD_STATUS.SCHEDULED]: 'Aula experimental',
    [LEAD_STATUS.COMPLETED]: PIPELINE_WAITING_DECISION_STAGE,
    [LEAD_STATUS.CONVERTED]: 'Matriculado',
    [LEAD_STATUS.MISSED]: LEAD_STATUS.MISSED,
    [LEAD_STATUS.LOST]: LEAD_STATUS.LOST,
  };
  if (direct[status]) return direct[status];

  const s = String(status || '').toLowerCase();
  if (s === 'novo') return 'Novo';
  if (s.includes('agendado')) return 'Aula experimental';
  if (s.includes('compareceu')) return PIPELINE_WAITING_DECISION_STAGE;
  if (s.includes('não compareceu') || s.includes('nao compareceu')) return LEAD_STATUS.MISSED;
  if (s.includes('não fechou') || s.includes('nao fechou') || s.includes('perdid')) return LEAD_STATUS.LOST;
  if (s.includes('matricul')) return 'Matriculado';
  return 'Novo';
}

/**
 * Resolve em qual coluna do Kanban o lead deve aparecer.
 * @param {object} lead
 * @param {{ stages?: Array<{id: string}>, isPendingTriage?: (lead: object) => boolean }} [opts]
 */
export function resolveLeadPipelineStageId(lead, { stages = [], isPendingTriage = () => false } = {}) {
  if (isPendingTriage(lead)) return 'Novo';

  if (lead?.status === LEAD_STATUS.MISSED) return LEAD_STATUS.MISSED;
  if (lead?.status === LEAD_STATUS.LOST) return LEAD_STATUS.LOST;
  if (lead?.status === LEAD_STATUS.CONVERTED) return 'Matriculado';

  const stageFromStatus = (l) => {
    const status = String(l?.status || '').trim();
    if (Object.values(LEAD_STATUS).includes(status)) {
      return pipelineStageFromLeadStatus(status);
    }
    const hasDirect = stages.find((s) => s.id === status);
    if (hasDirect) return status;
    return pipelineStageFromLeadStatus(status);
  };

  let stage = lead?.pipelineStage ? String(lead.pipelineStage).trim() : '';
  if (stage === 'Contato feito') stage = 'Novo';
  if (stage === 'Negociação') stage = 'Matriculado';

  if (!stage) return stageFromStatus(lead);

  if (stage === 'Aula experimental' && lead.status !== LEAD_STATUS.SCHEDULED) {
    return stageFromStatus(lead);
  }

  const normalizedStage = normalizePipelineStageId(stage);
  const known = stages.some((col) => normalizePipelineStageId(col.id) === normalizedStage);
  const statusStage = stageFromStatus(lead);

  if (known) {
    if (CANONICAL_PIPELINE_STAGE_IDS.has(normalizedStage) && statusStage !== normalizedStage) {
      return statusStage;
    }
    return normalizedStage;
  }

  const st = (lead.status || '').toLowerCase();
  if (st.includes('compareceu')) return PIPELINE_WAITING_DECISION_STAGE;
  if (st.includes('agendado')) return 'Aula experimental';
  if (st.includes('matricul')) return 'Matriculado';
  return statusStage || 'Novo';
}

/**
 * @param {string} pipelineStage
 * @returns {Record<string, unknown>}
 */
/** Conta leads por coluna do funil (usa as mesmas regras do Kanban). */
export function buildPipelineStageLeadCounts(
  leads,
  { stages = [], isPendingTriage = () => false } = {}
) {
  const counts = Object.create(null);
  for (const lead of Array.isArray(leads) ? leads : []) {
    const stageId = resolveLeadPipelineStageId(lead, { stages, isPendingTriage });
    if (!stageId) continue;
    counts[stageId] = (counts[stageId] || 0) + 1;
  }
  return counts;
}

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

function isExcludedFromExperimentalAgenda(lead) {
  return (
    String(lead?.origin || '').trim() === 'Planilha' ||
    lead?.status === LEAD_STATUS.CONVERTED ||
    String(lead?.pipelineStage || '').trim() === 'Matriculado'
  );
}

/**
 * Agenda semanal: mantém a experimental no dia agendado após presença/falta,
 * até remarcar (nova scheduledDate) ou sair do funil experimental.
 */
export function isLeadVisibleOnExperimentalAgenda(lead) {
  const status = String(lead?.status || '').trim();
  const onAgenda =
    status === LEAD_STATUS.SCHEDULED ||
    status === LEAD_STATUS.COMPLETED ||
    status === LEAD_STATUS.MISSED;
  return onAgenda && hasExperimentalCalendarDate(lead) && !isExcludedFromExperimentalAgenda(lead);
}

/**
 * Experimental pendente de presença (cards de hoje, KPIs de pendentes).
 */
export function isLeadScheduledForExperimental(lead) {
  return lead?.status === LEAD_STATUS.SCHEDULED && isLeadVisibleOnExperimentalAgenda(lead);
}

/** Lead com experimental no calendário em uma data civil (local). */
export function isLeadExperimentalOnDate(lead, date = new Date()) {
  if (!isLeadVisibleOnExperimentalAgenda(lead)) return false;
  const ymd = String(lead?.scheduledDate || '').trim().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const [y, m, d] = ymd.split('-').map(Number);
  const leadDay = new Date(y, (m || 1) - 1, d || 1);
  leadDay.setHours(0, 0, 0, 0);
  return leadDay.getTime() === day.getTime();
}
