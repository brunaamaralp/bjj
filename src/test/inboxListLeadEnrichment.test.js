import { describe, it, expect } from 'vitest';
import { toInboxListLeadSnippet } from '../../lib/server/inboxListLeadEnrichment.js';

describe('toInboxListLeadSnippet', () => {
  it('mapeia campos usados na lista da inbox', () => {
    const snippet = toInboxListLeadSnippet({
      $id: 'lead-1',
      name: 'Maria',
      phone: '5511999999999',
      status: 'Novo',
      pipeline_stage: 'Contato',
      contact_type: 'lead',
      whatsapp_lead_quente: 'sim',
      need_human: true,
      whatsapp_intention: 'aula experimental',
      whatsapp_priority: 'alta',
      triage_status: 'pending',
    });

    expect(snippet).toMatchObject({
      id: 'lead-1',
      name: 'Maria',
      phone: '5511999999999',
      hotLead: true,
      needHuman: true,
      intention: 'aula experimental',
      priority: 'alta',
      pipelineStage: 'Contato',
      triageStatus: 'pending',
    });
  });

  it('retorna null para doc ausente', () => {
    expect(toInboxListLeadSnippet(null)).toBeNull();
  });
});
