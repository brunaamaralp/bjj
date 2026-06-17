import { describe, it, expect } from 'vitest';
import { LEAD_STATUS } from '../lib/leadStatus.js';
import {
  buildPipelineStageLeadCounts,
  buildPipelineMovePayload,
  getPipelineMoveSuccessMessage,
  getStageUpdatePayload,
  isLeadScheduledForExperimental,
  isLeadVisibleOnExperimentalAgenda,
  isOpenFunnelLead,
  leadBelongsInPipelineColumn,
  pipelineStageFromLeadStatus,
  resolveLeadPipelineStageId,
  willAutoConfirmTriageOnMove,
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

  it('buildPipelineMovePayload confirma triagem ao sair de Novo', () => {
    const pending = { triageStatus: 'pending', inboundAuto: true, status: LEAD_STATUS.NEW };
    expect(buildPipelineMovePayload(pending, 'Primeiro contato')).toEqual({
      pipelineStage: 'Primeiro contato',
      status: LEAD_STATUS.NEW,
      triageStatus: 'confirmed',
    });
    expect(buildPipelineMovePayload(pending, 'Novo')).toEqual({
      pipelineStage: 'Novo',
      status: LEAD_STATUS.NEW,
    });
    expect(buildPipelineMovePayload({ triageStatus: 'confirmed' }, 'Primeiro contato')).toEqual({
      pipelineStage: 'Primeiro contato',
      status: LEAD_STATUS.NEW,
    });
  });

  it('getPipelineMoveSuccessMessage diferencia auto-confirmação de triagem', () => {
    const pending = { triageStatus: 'pending', inboundAuto: true };
    expect(willAutoConfirmTriageOnMove(pending, 'Primeiro contato')).toBe(true);
    expect(getPipelineMoveSuccessMessage(pending, 'Primeiro contato')).toBe(
      'Lead confirmado ao mudar de etapa'
    );
    expect(getPipelineMoveSuccessMessage(pending, 'Novo')).toBe('Movido no pipeline');
    expect(getPipelineMoveSuccessMessage({ triageStatus: 'confirmed' }, 'Primeiro contato')).toBe(
      'Movido no pipeline'
    );
  });

  it('leadBelongsInPipelineColumn coloca triagem pendente em Novo e custom na coluna certa', () => {
    const stages = [...buildDefaultPipelineStages(), { id: 'Primeiro contato', label: 'Primeiro contato' }];
    const displayIds = new Set(stages.map((s) => s.id));
    const mapStage = (lead) => resolveLeadPipelineStageId(lead, { stages, isPendingTriage: () => false });
    const pending = { triageStatus: 'pending', inboundAuto: true, status: LEAD_STATUS.NEW };
    const mapPending = (lead) => resolveLeadPipelineStageId(lead, {
      stages,
      isPendingTriage: (l) => l === pending || l?.triageStatus === 'pending',
    });

    expect(leadBelongsInPipelineColumn(pending, 'Novo', mapPending, displayIds)).toBe(true);
    expect(leadBelongsInPipelineColumn(pending, 'Primeiro contato', mapPending, displayIds)).toBe(false);

    const moved = {
      triageStatus: 'confirmed',
      status: LEAD_STATUS.NEW,
      pipelineStage: 'Primeiro contato',
    };
    expect(leadBelongsInPipelineColumn(moved, 'Primeiro contato', mapStage, displayIds)).toBe(true);
    expect(leadBelongsInPipelineColumn(moved, 'Novo', mapStage, displayIds)).toBe(false);
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

  it('resolveLeadPipelineStageId ignora coluna custom com id igual ao status operacional', () => {
    const stages = [...buildDefaultPipelineStages(), { id: 'Agendado', label: 'Agendado legado' }];
    const lead = { status: LEAD_STATUS.SCHEDULED, pipelineStage: 'Novo', scheduledDate: '2026-06-20' };
    expect(resolveLeadPipelineStageId(lead, { stages })).toBe('Aula experimental');
  });

  it('isOpenFunnelLead inclui Novo e Agendado', () => {
    expect(isOpenFunnelLead({ status: LEAD_STATUS.NEW })).toBe(true);
    expect(isOpenFunnelLead({ status: LEAD_STATUS.SCHEDULED })).toBe(true);
    expect(isOpenFunnelLead({ status: LEAD_STATUS.COMPLETED })).toBe(false);
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

  it('buildPipelineStageLeadCounts agrupa leads por coluna do funil', () => {
    const stages = [...buildDefaultPipelineStages(), { id: 'custom-followup', label: 'Follow-up' }];
    const leads = [
      { status: LEAD_STATUS.NEW, pipelineStage: 'Novo' },
      { status: LEAD_STATUS.NEW, pipelineStage: 'Novo' },
      { status: LEAD_STATUS.NEW, pipelineStage: 'custom-followup' },
    ];
    const counts = buildPipelineStageLeadCounts(leads, { stages });
    expect(counts.Novo).toBe(2);
    expect(counts['custom-followup']).toBe(1);
  });
});
