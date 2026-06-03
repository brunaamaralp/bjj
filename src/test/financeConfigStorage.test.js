import { describe, expect, it } from 'vitest';
import {
  buildAcademyFinanceConfigUpdate,
  mergeFinanceConfigFromAcademyDoc,
  FinanceConfigTooLargeError,
  FINANCE_CONFIG_LEGACY_MAX_CHARS,
} from '../lib/financeConfigStorage.js';

describe('financeConfigStorage', () => {
  it('keeps bank accounts in financeConfig when under limit', () => {
    const merged = {
      plans: [{ name: 'Mensal', price: 200 }],
      bankAccounts: [{ bankName: 'Nubank', account: '123', pixKey: '' }],
      cardFees: { pix: { percent: 0, fixed: 0 } },
    };
    const built = buildAcademyFinanceConfigUpdate({ settings: '{}' }, merged);
    expect(built.bankAccountsOffloaded).toBe(false);
    const parsed = JSON.parse(built.financeConfig);
    expect(parsed.bankAccounts).toHaveLength(1);
  });

  it('offloads bank accounts to onboardingChecklist when financeConfig exceeds legacy limit', () => {
    const plans = Array.from({ length: 10 }, (_, i) => ({
      name: `Plano ${i}`,
      price: 100 + i,
      description: 'x'.repeat(90),
      contractTemplateId: 'tpl_' + 'a'.repeat(20),
      rescissionTemplateId: 'tpl_' + 'b'.repeat(20),
    }));
    const banks = [
      { bankName: 'Banco A', account: '1', branch: '1', pixKey: 'pix-a' },
      { bankName: 'Banco B', account: '2', branch: '2', pixKey: 'pix-b' },
    ];
    const merged = { plans, bankAccounts: banks, cardFees: { pix: { percent: 0, fixed: 0 } } };
    const fullLen = JSON.stringify(merged).length;
    const leanLen = JSON.stringify({ ...merged, bankAccounts: [] }).length;
    expect(fullLen).toBeGreaterThan(FINANCE_CONFIG_LEGACY_MAX_CHARS);
    expect(leanLen).toBeLessThan(FINANCE_CONFIG_LEGACY_MAX_CHARS - 48);

    const built = buildAcademyFinanceConfigUpdate(
      { settings: '{}', onboardingChecklist: '[]' },
      merged,
      { hasSettingsAttribute: false }
    );
    expect(built.bankAccountsOffloaded).toBe(true);
    expect(JSON.parse(built.financeConfig).bankAccounts).toEqual([]);
    const onboarding = JSON.parse(built.onboardingChecklist);
    expect(onboarding.fba).toHaveLength(2);
  });

  it('mergeFinanceConfigFromAcademyDoc reads offloaded banks from settings', () => {
    const doc = {
      financeConfig: JSON.stringify({ plans: [{ name: 'Mensal', price: 100 }], bankAccounts: [] }),
      settings: JSON.stringify({
        financeBankAccountsOffloaded: true,
        financeBankAccounts: [{ bankName: 'Sicoob', account: '999', pixKey: '' }],
      }),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.bankAccounts).toHaveLength(1);
    expect(cfg.bankAccounts[0].bankName).toBe('Sicoob');
  });

  it('mergeFinanceConfigFromAcademyDoc reads bankAccounts alias in settings', () => {
    const doc = {
      financeConfig: JSON.stringify({ plans: [], bankAccounts: [] }),
      settings: JSON.stringify({
        bankAccounts: [{ bankName: 'Nubank', account: '1', pixKey: '' }],
      }),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.bankAccounts).toHaveLength(1);
    expect(cfg.bankAccounts[0].bankName).toBe('Nubank');
  });

  it('mergeFinanceConfigFromAcademyDoc reads offloaded banks from onboarding envelope', () => {
    const doc = {
      financeConfig: JSON.stringify({ plans: [{ name: 'Mensal', price: 100 }] }),
      onboardingChecklist: JSON.stringify({
        steps: [{ id: 'first_lead', done: true }],
        fba: [{ bankName: 'PIX', account: '', pixKey: 'k@mail.com' }],
      }),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.bankAccounts).toHaveLength(1);
    expect(cfg.bankAccounts[0].bankName).toBe('PIX');
  });

  it('throws when lean financeConfig still exceeds limit', () => {
    const merged = { plans: [{ name: 'x', price: 1, note: 'y'.repeat(3000) }], bankAccounts: [] };
    expect(() => buildAcademyFinanceConfigUpdate({}, merged)).toThrow(FinanceConfigTooLargeError);
  });
});
