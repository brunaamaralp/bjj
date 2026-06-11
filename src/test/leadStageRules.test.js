import { describe, it, expect } from 'vitest';
import { LEAD_STATUS } from '../lib/leadStatus.js';
import {
  getStageUpdatePayload,
  isLeadScheduledForExperimental,
  isLeadVisibleOnExperimentalAgenda,
  pipelineStageFromLeadStatus,
  resolveLeadPipelineStageId,
} from '../lib/leadStageRules.js';
import { buildDefaultPipelineStages } from '../lib/pipelineStagesConfig.js';

describe('leadStageRules', () => {
  it('getStageUpdatePayload inclui status para Aula experimental', () => {
    expect(getStageUpdatePayload('Aula experimental')).toEqual({
      pipelineStage: 'Aula experimental',
      status: LEAD_STATUS.SCHEDULED,
    });
  });

  it('getStageUpdatePayload retorna só pipelineStage para etapa custom desconhecida', () => {
    expect(getStageUpdatePayload('custom-etapa-xyz')).toEqual({
      pipelineStage: 'custom-etapa-xyz',
    });
  });

  it('isLeadScheduledForExperimental exige data YYYY-MM-DD e regras de funil', () => {
    const base = {
      status: LEAD_STATUS.SCHEDULED,
      scheduledDate: '2026-04-20',
      origin: 'WhatsApp',
      pipelineStage: 'Aula experimental',
      contact_type: 'lead',
    };
    expect(isLeadScheduledForExperimental(base)).toBe(true);
    expect(isLeadScheduledForExperimental({ ...base, scheduledDate: '' })).toBe(false);
    expect(isLeadScheduledForExperimental({ ...base, origin: 'Planilha' })).toBe(false);
    expect(isLeadScheduledForExperimental({ ...base, contact_type: 'student' })).toBe(true);
    expect(isLeadScheduledForExperimental({ ...base, pipelineStage: 'Matriculado' })).toBe(false);
  });

  it('pipelineStageFromLeadStatus mapeia Agendado para Aula experimental', () => {
    expect(pipelineStageFromLeadStatus(LEAD_STATUS.SCHEDULED)).toBe('Aula experimental');
    expect(pipelineStageFromLeadStatus(LEAD_STATUS.NEW)).toBe('Novo');
  });

  it('resolveLeadPipelineStageId prioriza status quando pipelineStage canônico está desatualizado', () => {
    const stages = buildDefaultPipelineStages();
    const scheduled = {
      status: LEAD_STATUS.SCHEDULED,
      pipelineStage: 'Novo',
      scheduledDate: '2026-06-15',
    };
    expect(resolveLeadPipelineStageId(scheduled, { stages })).toBe('Aula experimental');

    const fresh = {
      status: LEAD_STATUS.NEW,
      pipelineStage: 'Novo',
    };
    expect(resolveLeadPipelineStageId(fresh, { stages })).toBe('Novo');
  });

  it('resolveLeadPipelineStageId mantém etapa customizada do funil', () => {
    const stages = [...buildDefaultPipelineStages(), { id: 'custom-followup', label: 'Follow-up' }];
    const lead = { status: LEAD_STATUS.NEW, pipelineStage: 'custom-followup' };
    expect(resolveLeadPipelineStageId(lead, { stages })).toBe('custom-followup');
  });

  it('isLeadVisibleOnExperimentalAgenda inclui compareceu e faltou no dia agendado', () => {
    const base = {
      scheduledDate: '2026-04-20',
      origin: 'WhatsApp',
      pipelineStage: 'Aguardando decisão',
    };
    expect(isLeadVisibleOnExperimentalAgenda({ ...base, status: LEAD_STATUS.SCHEDULED })).toBe(true);
    expect(isLeadVisibleOnExperimentalAgenda({ ...base, status: LEAD_STATUS.COMPLETED })).toBe(true);
    expect(isLeadVisibleOnExperimentalAgenda({ ...base, status: LEAD_STATUS.MISSED })).toBe(true);
    expect(isLeadScheduledForExperimental({ ...base, status: LEAD_STATUS.COMPLETED })).toBe(false);
    expect(isLeadVisibleOnExperimentalAgenda({ ...base, status: LEAD_STATUS.COMPLETED, scheduledDate: '' })).toBe(
      false
    );
  });
});
