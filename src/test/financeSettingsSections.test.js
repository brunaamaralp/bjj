import { describe, it, expect } from 'vitest';
import {
  buildFinanceSettingsSummaries,
  financeSettingsProgress,
  FINANCE_SETTINGS_SECTIONS,
  isFinanceSettingsSection,
} from '../lib/financeSettingsSections.js';

describe('financeSettingsSections', () => {
  it('isFinanceSettingsSection validates slugs', () => {
    expect(isFinanceSettingsSection('planos')).toBe('planos');
    expect(isFinanceSettingsSection('invalid')).toBe(null);
  });

  it('buildFinanceSettingsSummaries marks plans done when named', () => {
    const summaries = buildFinanceSettingsSummaries({
      financeConfig: { plans: [{ name: 'Mensal', price: 150 }], bankAccounts: [], cardFees: {} },
      collectionRules: [{ day: 1 }],
      accountsCount: 0,
      isOwner: true,
    });
    expect(summaries[FINANCE_SETTINGS_SECTIONS.PLANOS].done).toBe(true);
    expect(summaries[FINANCE_SETTINGS_SECTIONS.PLANOS].summary).toContain('Mensal');
  });

  it('financeSettingsProgress counts core sections', () => {
    const summaries = buildFinanceSettingsSummaries({
      financeConfig: { plans: [], bankAccounts: [{ bankName: 'BB' }], cardFees: {} },
      collectionRules: [],
      accountsCount: 0,
      isOwner: true,
    });
    const p = financeSettingsProgress(summaries);
    expect(p.total).toBe(4);
    expect(p.done).toBeGreaterThanOrEqual(1);
  });
});
