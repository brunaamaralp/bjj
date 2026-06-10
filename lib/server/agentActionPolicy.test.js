import { describe, it, expect } from 'vitest';
import { getAiActionsPolicy, isAiActionAllowed, V1_AI_ACTIONS } from './agentActionPolicy.js';

describe('agentActionPolicy', () => {
  it('defaults all v1 actions enabled', () => {
    const p = getAiActionsPolicy({});
    expect(p.enabled).toBe(true);
    for (const a of V1_AI_ACTIONS) expect(p.actions.has(a)).toBe(true);
  });

  it('respects modules.ai_actions disable', () => {
    const p = getAiActionsPolicy({
      modules: JSON.stringify({ ai_actions: { enabled: false, actions: ['add_lead_note'] } }),
    });
    expect(p.enabled).toBe(false);
    expect(isAiActionAllowed({ modules: { ai_actions: { enabled: false } } }, 'add_lead_note')).toBe(false);
  });
});
