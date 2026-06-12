import { describe, expect, it } from 'vitest';
import {
  mapMessagesForCopilotContext,
  resolveConversationMessagesFromDoc,
} from '../../lib/server/followupCopilotMessages.js';

describe('followupCopilotMessages', () => {
  it('lê messages_recent quando messages está vazio', () => {
    const doc = {
      messages: JSON.stringify([]),
      messages_recent: JSON.stringify([
        { role: 'user', content: 'Gostei da aula', timestamp: '2026-06-10T10:00:00.000Z' },
        { role: 'assistant', content: 'Que bom!', timestamp: '2026-06-10T10:01:00.000Z' },
      ]),
    };

    const msgs = resolveConversationMessagesFromDoc(doc, 20);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: 'cliente', content: 'Gostei da aula', at: '2026-06-10T10:00:00.000Z' });
    expect(msgs[1]).toEqual({ role: 'assistente', content: 'Que bom!', at: '2026-06-10T10:01:00.000Z' });
  });

  it('mapeia roles para o prompt do copilot', () => {
    expect(
      mapMessagesForCopilotContext([
        { role: 'user', content: 'Planos?' },
        { role: 'assistant', content: 'Temos mensal.' },
        { role: 'system', content: '' },
      ])
    ).toEqual([
      { role: 'cliente', content: 'Planos?', at: '' },
      { role: 'assistente', content: 'Temos mensal.', at: '' },
    ]);
  });
});
