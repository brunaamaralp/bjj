import { describe, expect, it } from 'vitest';
import {
  buildAcademyFinanceConfigUpdate,
  mergeFinanceConfigFromAcademyDoc,
  auditBankAccountsFromAcademyDoc,
  compactPlanForStorage,
  FinanceConfigTooLargeError,
  FINANCE_CONFIG_LEGACY_MAX_CHARS,
} from '../lib/financeConfigStorage.js';

describe('financeConfigStorage', () => {
  it('compactPlanForStorage omits legacy durationDays', () => {
    const compact = compactPlanForStorage({
      name: 'Mensal',
      price: 150,
      durationDays: 90,
      description: 'x',
      applyCardFee: true,
    });
    expect(compact).not.toHaveProperty('durationDays');
    expect(compact.name).toBe('Mensal');
    expect(compact.price).toBe(150);
  });

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

  it('offloads bank accounts to settings when financeConfig exceeds legacy limit', () => {
    const plans = [{ name: 'Mensal', price: 200 }];
    const banks = Array.from({ length: 30 }, (_, i) => ({
      bankName: `Banco ${i}`,
      account: String(1000 + i),
      branch: String(i),
      pixKey: `pix-${i}@mail.com`,
    }));
    const merged = { plans, bankAccounts: banks, cardFees: { pix: { percent: 0, fixed: 0 } } };
    const fullLen = JSON.stringify(merged).length;
    const leanLen = JSON.stringify({ ...merged, bankAccounts: [] }).length;
    expect(fullLen).toBeGreaterThan(FINANCE_CONFIG_LEGACY_MAX_CHARS);
    expect(leanLen).toBeLessThan(FINANCE_CONFIG_LEGACY_MAX_CHARS - 48);

    const built = buildAcademyFinanceConfigUpdate({ settings: '{}' }, merged, {
      hasSettingsAttribute: true,
    });
    expect(built.bankAccountsOffloaded).toBe(true);
    expect(JSON.parse(built.financeConfig).bankAccounts).toEqual([]);
    const settings = JSON.parse(built.settings);
    expect(settings.financeBankAccounts).toHaveLength(30);
  });

  it('offloads bank accounts to onboardingChecklist when settings is unavailable', () => {
    const plans = [{ name: 'Mensal', price: 200 }];
    const banks = Array.from({ length: 6 }, (_, i) => ({
      bankName: `Banco ${i}`,
      account: String(i),
      branch: '1',
      pixKey: `pix-${i}`,
    }));
    const merged = {
      plans,
      bankAccounts: banks,
      cardFees: { pix: { percent: 0, fixed: 0 } },
      legacyBlob: 'z'.repeat(2100),
    };
    const built = buildAcademyFinanceConfigUpdate(
      { settings: '{}', onboardingChecklist: '[]' },
      merged,
      { hasSettingsAttribute: false }
    );
    expect(built.bankAccountsOffloaded).toBe(true);
    expect(JSON.parse(built.financeConfig).bankAccounts).toEqual([]);
    const onboarding = JSON.parse(built.onboardingChecklist);
    expect(onboarding.fba).toHaveLength(6);
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

  it('mergeFinanceConfigFromAcademyDoc reads root financeBankAccounts attribute', () => {
    const doc = {
      financeConfig: JSON.stringify({ plans: [], bankAccounts: [] }),
      financeBankAccounts: JSON.stringify([{ bankName: 'Caixa', account: '55', pixKey: '' }]),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.bankAccounts).toHaveLength(1);
    expect(cfg.bankAccounts[0].bankName).toBe('Caixa');
  });

  it('auditBankAccountsFromAcademyDoc flags overflow-only academies', () => {
    const doc = {
      financeConfig: JSON.stringify({ plans: [{ name: 'Mensal', price: 100 }], bankAccounts: [] }),
      settings: JSON.stringify({
        financeBankAccounts: [{ bankName: 'BB', account: '1', pixKey: '' }],
      }),
    };
    const audit = auditBankAccountsFromAcademyDoc(doc);
    expect(audit.needsRecovery).toBe(true);
    expect(audit.merged).toHaveLength(1);
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

  it('offloads plans to settings when financeConfig exceeds legacy limit even without banks', () => {
    const plans = Array.from({ length: 12 }, (_, i) => ({
      name: `Plano longo ${i}`,
      price: 100 + i,
      description: 'd'.repeat(120),
      applyCardFee: true,
    }));
    const merged = {
      plans,
      bankAccounts: [],
      cardFees: { pix: { percent: 0, fixed: 0 } },
      collectionRules: [{ day: 1, label: '1ª', defaultMessage: 'm'.repeat(200), escalate: false }],
    };
    const built = buildAcademyFinanceConfigUpdate({ settings: '{}' }, merged, {
      hasSettingsAttribute: true,
    });
    expect(built.plansOffloaded).toBe(true);
    expect(JSON.parse(built.financeConfig).plans).toEqual([]);
    const settings = JSON.parse(built.settings);
    expect(settings.financePlans).toHaveLength(12);
    const cfg = mergeFinanceConfigFromAcademyDoc({
      financeConfig: built.financeConfig,
      settings: built.settings,
    });
    expect(cfg.plans).toHaveLength(12);
    expect(cfg.plans[0].name).toBe('Plano longo 0');
  });

  it('mergeFinanceConfigFromAcademyDoc reads offloaded plans from settings', () => {
    const doc = {
      financeConfig: JSON.stringify({ plans: [], bankAccounts: [] }),
      settings: JSON.stringify({
        financePlansOffloaded: true,
        financePlans: [{ name: 'Mensal', price: 150 }],
      }),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.plans).toEqual([expect.objectContaining({ name: 'Mensal', price: 150 })]);
  });

  it('mergeFinanceConfigFromAcademyDoc falls back to financeConfig plans when offload flag is set but settings list is empty', () => {
    const doc = {
      financeConfig: JSON.stringify({ plans: [{ name: 'Mensal', price: 150 }], bankAccounts: [] }),
      settings: JSON.stringify({
        financePlansOffloaded: true,
        financePlans: [],
      }),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.plans).toEqual([expect.objectContaining({ name: 'Mensal', price: 150 })]);
  });

  it('throws when lean financeConfig still exceeds limit', () => {
    const merged = { plans: [], bankAccounts: [], extraPayload: 'y'.repeat(3000) };
    expect(() => buildAcademyFinanceConfigUpdate({}, merged)).toThrow(FinanceConfigTooLargeError);
  });
});
