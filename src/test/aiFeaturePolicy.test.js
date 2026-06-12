import { describe, it, expect } from 'vitest';
import {
  isAiModuleEnabled,
  assertAiModuleEnabled,
  AiFeatureDisabledError,
} from '../../lib/server/aiFeaturePolicy.js';
import { normalizeAiModule, mergeAiModuleIntoModulesString } from '../../lib/agentActionConfig.js';

describe('normalizeAiModule', () => {
  it('defaults to enabled', () => {
    expect(normalizeAiModule(undefined).enabled).toBe(true);
    expect(normalizeAiModule(null).enabled).toBe(true);
  });

  it('respects enabled false', () => {
    expect(normalizeAiModule({ enabled: false }).enabled).toBe(false);
  });
});

describe('isAiModuleEnabled', () => {
  it('returns true when modules.ai missing', () => {
    expect(isAiModuleEnabled({ modules: '{}' })).toBe(true);
  });

  it('returns false when modules.ai.enabled is false', () => {
    expect(isAiModuleEnabled({ modules: JSON.stringify({ ai: { enabled: false } }) })).toBe(false);
  });
});

describe('assertAiModuleEnabled', () => {
  it('throws AiFeatureDisabledError when disabled', () => {
    expect(() =>
      assertAiModuleEnabled({ modules: JSON.stringify({ ai: { enabled: false } }) })
    ).toThrow(AiFeatureDisabledError);
  });
});

describe('mergeAiModuleIntoModulesString', () => {
  it('preserves other module keys', () => {
    const base = JSON.stringify({ sales: true, ai_actions: { enabled: true, actions: [] } });
    const out = JSON.parse(mergeAiModuleIntoModulesString(base, { enabled: false }));
    expect(out.sales).toBe(true);
    expect(out.ai.enabled).toBe(false);
    expect(out.ai_actions).toBeDefined();
  });
});
