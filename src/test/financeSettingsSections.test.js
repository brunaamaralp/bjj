import { describe, it, expect } from 'vitest';
import {
  buildFinanceSettingsSummaries,
  buildFinanceSettingsNavItems,
  canAccessEmpresaFinanceSettings,
  financeSettingsProgress,
  FINANCE_SETTINGS_SECTIONS,
  getFinanceDefaultSection,
  isFinanceSettingsSection,
} from '../lib/financeSettingsSections.js';

describe('financeSettingsSections', () => {
  it('canAccessEmpresaFinanceSettings allows owner and admin only', () => {
    expect(canAccessEmpresaFinanceSettings('owner')).toBe(true);
    expect(canAccessEmpresaFinanceSettings('admin')).toBe(true);
    expect(canAccessEmpresaFinanceSettings('member')).toBe(false);
    expect(canAccessEmpresaFinanceSettings('guest')).toBe(false);
  });

  it('getFinanceDefaultSection uses recebimento for non-owner', () => {
    expect(getFinanceDefaultSection(true)).toBe(FINANCE_SETTINGS_SECTIONS.PLANOS);
    expect(getFinanceDefaultSection(false)).toBe(FINANCE_SETTINGS_SECTIONS.RECEBIMENTO);
  });

  it('buildFinanceSettingsNavItems hides owner-only sections for admin', () => {
    const adminNav = buildFinanceSettingsNavItems(false);
    const ids = adminNav.map((item) => item.id);
    expect(ids).toContain(FINANCE_SETTINGS_SECTIONS.RECEBIMENTO);
    expect(ids).toContain(FINANCE_SETTINGS_SECTIONS.TAXAS);
    expect(ids).not.toContain(FINANCE_SETTINGS_SECTIONS.PLANOS);
    expect(ids).not.toContain(FINANCE_SETTINGS_SECTIONS.REGUA);
    expect(ids).not.toContain(FINANCE_SETTINGS_SECTIONS.CONTRATOS);
    expect(ids).not.toContain(FINANCE_SETTINGS_SECTIONS.PLANO_CONTAS);
    expect(ids).not.toContain(FINANCE_SETTINGS_SECTIONS.RAZAO);
  });

  it('financeSettingsProgress for admin counts recebimento and taxas only', () => {
    const summaries = buildFinanceSettingsSummaries({
      financeConfig: { plans: [], bankAccounts: [{ bankName: 'BB' }], cardFees: {} },
      collectionRules: [],
      accountsCount: 0,
      isOwner: false,
    });
    const p = financeSettingsProgress(summaries, { isOwner: false });
    expect(p.total).toBe(2);
    expect(p.done).toBe(1);
  });

  it('isFinanceSettingsSection validates slugs', () => {
    expect(isFinanceSettingsSection('planos')).toBe('planos');
    expect(isFinanceSettingsSection('razao-contabil')).toBe('razao-contabil');
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
