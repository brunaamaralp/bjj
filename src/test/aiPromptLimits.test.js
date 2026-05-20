import { describe, it, expect } from 'vitest';
import { validatePromptFields, isPromptContentConfigured } from '../../lib/aiPromptLimits.js';
import { assembleAgentSystemPromptBounded } from '../../lib/server/assembleAgentSystemPrompt.js';

describe('validatePromptFields', () => {
  it('rejeita intro e body vazios', () => {
    expect(validatePromptFields('', '').ok).toBe(false);
  });

  it('aceita só body', () => {
    expect(validatePromptFields('', 'conteúdo').ok).toBe(true);
  });
});

describe('isPromptContentConfigured', () => {
  it('detecta prompt configurado', () => {
    expect(isPromptContentConfigured('oi', '')).toBe(true);
    expect(isPromptContentConfigured('', '')).toBe(false);
  });
});

describe('assembleAgentSystemPromptBounded', () => {
  it('retorna system dentro do limite', () => {
    const { system, truncated } = assembleAgentSystemPromptBounded({
      effectiveIntro: 'Intro curta',
      effectiveBody: 'Corpo curto',
      extraSuffix: '',
      profileLine: '',
      nomeContatoLine: '',
      summaryText: '',
      faqItems: [{ q: 'Q', a: 'A' }],
    });
    expect(system.length).toBeGreaterThan(10);
    expect(truncated).toBe(false);
  });
});
