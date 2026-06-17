import { describe, it, expect } from 'vitest';
import {
  AUTOMACOES_TABS,
  FINANCE_WHATSAPP_REMINDERS_PATH,
  normalizeAutomacoesTab,
} from '../lib/automacoesHub.js';

describe('automacoesHub', () => {
  it('AUTOMACOES_TABS tem modelos e gatilhos', () => {
    expect(AUTOMACOES_TABS.map((t) => t.id)).toEqual(['modelos', 'gatilhos']);
  });

  it('normalizeAutomacoesTab redireciona processos', () => {
    expect(normalizeAutomacoesTab('processos')).toEqual({
      kind: 'redirect',
      to: '/tarefas?tab=processos',
    });
  });

  it('normalizeAutomacoesTab alias configuracoes', () => {
    expect(normalizeAutomacoesTab('configuracoes')).toEqual({ kind: 'tab', tab: 'gatilhos' });
  });

  it('normalizeAutomacoesTab default modelos', () => {
    expect(normalizeAutomacoesTab('')).toEqual({ kind: 'tab', tab: 'modelos' });
  });

  it('link de lembretes financeiros aponta para seção correta', () => {
    expect(FINANCE_WHATSAPP_REMINDERS_PATH).toContain('lembretes-whatsapp');
  });
});
