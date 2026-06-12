import { describe, it, expect } from 'vitest';
import { AUTOMACOES_TABS, FINANCE_WHATSAPP_REMINDERS_PATH } from '../lib/automacoesHub.js';

describe('automacoesHub', () => {
  it('mantém id processos na URL com label de tarefas', () => {
    const tab = AUTOMACOES_TABS.find((t) => t.id === 'processos');
    expect(tab?.label).toMatch(/tarefas/i);
  });

  it('link de lembretes financeiros aponta para seção correta', () => {
    expect(FINANCE_WHATSAPP_REMINDERS_PATH).toContain('lembretes-whatsapp');
  });
});
