import { describe, it, expect } from 'vitest';
import {
  buildTriageDismissedAgentState,
  clearTriageDismissedAgentState,
  isConversationTriageDismissed,
  TRIAGE_DISMISSED_STATE_KEY,
} from '../../lib/server/conversationTriageDismissed.js';

describe('conversationTriageDismissed', () => {
  it('detecta conversa com triagem descartada no agent_state', () => {
    expect(
      isConversationTriageDismissed({
        agent_state: JSON.stringify({ [TRIAGE_DISMISSED_STATE_KEY]: true }),
      })
    ).toBe(true);
  });

  it('ignora conversa sem flag', () => {
    expect(isConversationTriageDismissed({ agent_state: '{}' })).toBe(false);
    expect(isConversationTriageDismissed(null)).toBe(false);
  });

  it('preserva estado existente ao marcar descarte', () => {
    const next = buildTriageDismissedAgentState({ intake: { step: 1 } });
    expect(next.intake).toEqual({ step: 1 });
    expect(next[TRIAGE_DISMISSED_STATE_KEY]).toBe(true);
    expect(next.triage_dismissed_at).toBeTruthy();
  });

  it('limpa flag de descarte preservando demais campos', () => {
    const cleared = clearTriageDismissedAgentState({
      intake: { step: 2 },
      [TRIAGE_DISMISSED_STATE_KEY]: true,
      triage_dismissed_at: '2026-06-01T00:00:00.000Z',
    });
    expect(cleared.intake).toEqual({ step: 2 });
    expect(cleared[TRIAGE_DISMISSED_STATE_KEY]).toBeUndefined();
    expect(cleared.triage_dismissed_at).toBeUndefined();
  });
});
