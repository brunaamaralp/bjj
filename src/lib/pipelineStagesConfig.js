import { LEAD_STATUS } from '../store/useLeadStore';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';
import { TERMS } from './terminology.js';

export const DEFAULT_STAGE_SLA_DAYS = 3;

/** Ordem padrão do funil (Kanban). */
export function buildDefaultPipelineStages(terms = TERMS.fitness) {
  return [
    { id: 'Novo', label: 'Novo', slaDays: DEFAULT_STAGE_SLA_DAYS },
    { id: 'Aula experimental', label: 'Experimental', slaDays: DEFAULT_STAGE_SLA_DAYS },
    { id: LEAD_STATUS.MISSED, label: 'Não compareceu', slaDays: DEFAULT_STAGE_SLA_DAYS },
    { id: PIPELINE_WAITING_DECISION_STAGE, label: 'Aguardando decisão', slaDays: DEFAULT_STAGE_SLA_DAYS },
    { id: 'Matriculado', label: terms.pipelineEnrolledColumnLabel, slaDays: DEFAULT_STAGE_SLA_DAYS },
    { id: LEAD_STATUS.LOST, label: 'Perdidos', slaDays: DEFAULT_STAGE_SLA_DAYS },
  ];
}

function ensureSpecialColumns(cols) {
  const base = Array.isArray(cols) ? cols.filter(Boolean) : [];
  const ids = new Set(base.map((c) => String(c?.id || '').trim()).filter(Boolean));
  const out = [...base];
  if (!ids.has('Novo')) {
    out.unshift({ id: 'Novo', label: 'Novo', slaDays: DEFAULT_STAGE_SLA_DAYS });
  }
  if (!ids.has('Aula experimental')) {
    const novoIdx = out.findIndex((c) => String(c?.id || '').trim() === 'Novo');
    const row = { id: 'Aula experimental', label: 'Experimental', slaDays: DEFAULT_STAGE_SLA_DAYS };
    out.splice(novoIdx >= 0 ? novoIdx + 1 : out.length, 0, row);
  }
  if (!ids.has(LEAD_STATUS.MISSED)) {
    out.push({ id: LEAD_STATUS.MISSED, label: 'Não compareceu', slaDays: DEFAULT_STAGE_SLA_DAYS });
  }
  if (!ids.has(LEAD_STATUS.LOST)) {
    out.push({ id: LEAD_STATUS.LOST, label: 'Perdidos', slaDays: DEFAULT_STAGE_SLA_DAYS });
  }
  return out;
}

function mergeWaitingDecisionStage(cols) {
  const base = Array.isArray(cols) ? [...cols].filter(Boolean) : [];
  const ids = new Set(base.map((c) => String(c?.id || '').trim()).filter(Boolean));
  if (ids.has(PIPELINE_WAITING_DECISION_STAGE)) return base;
  const matIdx = base.findIndex((c) => String(c?.id || '').trim() === 'Matriculado');
  const row = {
    id: PIPELINE_WAITING_DECISION_STAGE,
    label: 'Aguardando decisão',
    slaDays: DEFAULT_STAGE_SLA_DAYS,
  };
  if (matIdx >= 0) {
    base.splice(matIdx, 0, row);
  } else {
    const expIdx = base.findIndex((c) => String(c?.id || '').trim() === 'Aula experimental');
    base.splice(expIdx >= 0 ? expIdx + 1 : base.length, 0, row);
  }
  return base;
}

function applyMatriculadoLabel(cols, vertical) {
  if (vertical !== 'physio') return cols;
  return (cols || []).map((c) =>
    String(c?.id || '').trim() === 'Matriculado'
      ? { ...c, label: TERMS.physio.pipelineEnrolledColumnLabel }
      : c
  );
}

export function normalizePipelineStagesFromDoc(stagesConfig, { vertical = 'fitness', terms } = {}) {
  const t = terms || (vertical === 'physio' ? TERMS.physio : TERMS.fitness);
  let conf = stagesConfig;
  if (typeof conf === 'string') {
    try {
      conf = JSON.parse(conf);
    } catch {
      conf = null;
    }
  }
  const base =
    Array.isArray(conf) && conf.length > 0 ? conf : buildDefaultPipelineStages(t);
  return applyMatriculadoLabel(
    ensureSpecialColumns(mergeWaitingDecisionStage(base)),
    vertical
  ).map((s) => ({
    id: String(s.id || '').trim(),
    label: String(s.label || s.id || '').trim(),
    slaDays: Number.isFinite(s.slaDays) ? s.slaDays : DEFAULT_STAGE_SLA_DAYS,
  }));
}

export function cleanStagesForSave(stages) {
  return (stages || [])
    .filter((s) => s && String(s.id).trim())
    .map((s) => ({
      id: String(s.id).trim(),
      label: String(s.label || s.id).trim(),
      slaDays: Number.isFinite(s.slaDays) ? s.slaDays : DEFAULT_STAGE_SLA_DAYS,
    }));
}
