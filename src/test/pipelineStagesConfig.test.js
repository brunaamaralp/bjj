import { describe, it, expect } from 'vitest';
import { LEAD_STATUS } from '../store/useLeadStore';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';
import {
  isPipelineStageDeletable,
  isPipelineStageLabelLocked,
  cleanStagesForSave,
  DEFAULT_STAGE_SLA_DAYS,
} from '../lib/pipelineStagesConfig.js';

describe('pipelineStagesConfig editor helpers', () => {
  it('bloqueia rótulo apenas em etapas de status fixo', () => {
    expect(isPipelineStageLabelLocked(LEAD_STATUS.MISSED)).toBe(true);
    expect(isPipelineStageLabelLocked(LEAD_STATUS.LOST)).toBe(true);
    expect(isPipelineStageLabelLocked('Novo')).toBe(false);
    expect(isPipelineStageLabelLocked('custom-123')).toBe(false);
  });

  it('permite excluir apenas etapas fora do funil canônico', () => {
    expect(isPipelineStageDeletable('custom-123')).toBe(true);
    expect(isPipelineStageDeletable('Minha etapa')).toBe(true);
    expect(isPipelineStageDeletable('Novo')).toBe(false);
    expect(isPipelineStageDeletable('Aula experimental')).toBe(false);
    expect(isPipelineStageDeletable(PIPELINE_WAITING_DECISION_STAGE)).toBe(false);
    expect(isPipelineStageDeletable('Matriculado')).toBe(false);
    expect(isPipelineStageDeletable(LEAD_STATUS.MISSED)).toBe(false);
    expect(isPipelineStageDeletable(LEAD_STATUS.LOST)).toBe(false);
  });

  it('cleanStagesForSave aplica SLA padrão quando vazio', () => {
    expect(cleanStagesForSave([{ id: 'custom-1', label: 'Teste', slaDays: null }])).toEqual([
      { id: 'custom-1', label: 'Teste', slaDays: DEFAULT_STAGE_SLA_DAYS },
    ]);
  });
});
