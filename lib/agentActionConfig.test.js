import { describe, it, expect } from 'vitest';
import {
  V1_AI_ACTIONS,
  normalizeAiActionsConfig,
  getAiActionsPolicyFromModules,
} from './agentActionConfig.js';

describe('agentActionConfig', () => {
  it('defaults all v1 actions enabled', () => {
    const cfg = normalizeAiActionsConfig(null);
    expect(cfg.enabled).toBe(true);
    expect(cfg.actions).toEqual(V1_AI_ACTIONS);
    expect(cfg.conversation_timeline?.enabled).toBe(true);
  });

  it('filters unknown actions', () => {
    const cfg = normalizeAiActionsConfig({
      enabled: true,
      actions: ['add_lead_note', 'delete_everything'],
    });
    expect(cfg.actions).toEqual(['add_lead_note']);
  });

  it('reads policy from modules JSON string', () => {
    const p = getAiActionsPolicyFromModules(
      JSON.stringify({ ai_actions: { enabled: false, actions: ['freeze_plan'] } })
    );
    expect(p.enabled).toBe(false);
    expect(p.actions.has('freeze_plan')).toBe(true);
    expect(p.actions.has('add_lead_note')).toBe(false);
  });
});
