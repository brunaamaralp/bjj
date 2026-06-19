import { describe, it, expect } from 'vitest';
import { onboardingStepPath, isOnboardingStepDone } from '../lib/onboardingChecklist.js';
import { AGENTE_IA_SETUP_PATH } from '../lib/agentIaRoutes.js';

describe('onboardingStepPath', () => {
  it('maps loja steps to produtos and estoque tabs', () => {
    expect(onboardingStepPath('first_product')).toBe('/loja?tab=produtos');
    expect(onboardingStepPath('first_stock_entry')).toBe('/loja?tab=estoque');
  });

  it('keeps known CRM and config destinations', () => {
    expect(onboardingStepPath('first_lead')).toBe('/new-lead');
    expect(onboardingStepPath('connect_whatsapp')).toBe('/integracoes?tab=whatsapp');
    expect(onboardingStepPath('setup_ai')).toBe(AGENTE_IA_SETUP_PATH);
    expect(onboardingStepPath('setup_finance')).toBe('/empresa?tab=financeiro');
    expect(onboardingStepPath('install_pwa')).toBe(null);
  });

  it('falls back to dashboard for unknown ids', () => {
    expect(onboardingStepPath('unknown_step')).toBe('/');
  });

  it('isOnboardingStepDone reads checklist rows', () => {
    const list = [{ id: 'connect_whatsapp', done: true }, { id: 'setup_ai', done: false }];
    expect(isOnboardingStepDone(list, 'connect_whatsapp')).toBe(true);
    expect(isOnboardingStepDone(list, 'setup_ai')).toBe(false);
    expect(isOnboardingStepDone(list, 'missing')).toBe(false);
  });
});
