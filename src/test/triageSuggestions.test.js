import { describe, expect, it } from 'vitest';
import { TERMS } from '../lib/terminology.js';
import { suggestTriageAction, triageContextLine } from '../lib/triageSuggestions.js';

describe('suggestTriageAction', () => {
  it('suggests link_student for aluno_atual', () => {
    expect(suggestTriageAction({ intention: 'aluno_atual' })).toBe('link_student');
  });

  it('suggests link_student for whatsapp contact type aluno', () => {
    expect(suggestTriageAction({ whatsappContactType: 'aluno' })).toBe('link_student');
  });

  it('suggests dismiss for aviso_sem_pergunta', () => {
    expect(suggestTriageAction({ intention: 'aviso_sem_pergunta' })).toBe('dismiss');
  });

  it('suggests confirm for hot lead', () => {
    expect(suggestTriageAction({ whatsappContactType: 'lead', hotLead: true })).toBe('confirm');
  });

  it('defaults to confirm', () => {
    expect(suggestTriageAction({ intention: 'duvida' })).toBe('confirm');
  });
});

describe('triageContextLine', () => {
  it('returns vertical-aware line for fitness', () => {
    const line = triageContextLine({ intention: 'aula_experimental' }, { terms: TERMS.fitness });
    expect(line).toBe('IA identificou: Quer agendar experimental');
  });

  it('returns vertical-aware line for physio', () => {
    const line = triageContextLine({ intention: 'aula_experimental' }, { terms: TERMS.physio });
    expect(line).toBe('IA identificou: Quer agendar avaliação');
  });

  it('returns empty when no intention', () => {
    expect(triageContextLine({})).toBe('');
  });
});
