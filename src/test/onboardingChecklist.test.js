import { describe, it, expect } from 'vitest';
import { onboardingStepPath } from '../lib/onboardingChecklist.js';

describe('onboardingStepPath', () => {
  it('maps loja steps to produtos and estoque tabs', () => {
    expect(onboardingStepPath('first_product')).toBe('/loja?tab=produtos');
    expect(onboardingStepPath('first_stock_entry')).toBe('/loja?tab=estoque');
  });

  it('keeps known CRM and config destinations', () => {
    expect(onboardingStepPath('first_lead')).toBe('/new-lead');
    expect(onboardingStepPath('setup_finance')).toBe('/empresa?tab=financeiro');
    expect(onboardingStepPath('install_pwa')).toBe(null);
  });

  it('falls back to dashboard for unknown ids', () => {
    expect(onboardingStepPath('unknown_step')).toBe('/');
  });
});
