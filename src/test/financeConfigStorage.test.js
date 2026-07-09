import { describe, expect, it } from 'vitest';
import {
  buildAcademyFinanceConfigUpdate,
  mergeFinanceConfigFromAcademyDoc,
  auditBankAccountsFromAcademyDoc,
  compactPlanForStorage,
  enrichFinanceConfigWithOrphanLabels,
  coerceBankAccountList,
  FinanceConfigTooLargeError,
  FINANCE_CONFIG_LEGACY_MAX_CHARS,
  FINANCE_CONFIG_TARGET_MAX_CHARS,
  compactFinanceConfigForStorage,
  unionFinanceConfigForPersist,
} from '../lib/financeConfigStorage.js';
import { defaultFeeReceiver, emptyFeeReceiverFeeTable, readFeeReceivers } from '../lib/feeReceivers.js';

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

  it('compactPlanForStorage ignora plano embutido Isento', () => {
    expect(compactPlanForStorage({ name: 'Isento', price: 0, isExempt: true, builtin: true })).toBeNull();
  });

  it('keeps bank accounts in financeConfig when under legacy limit', () => {
    const merged = {
      plans: [{ name: 'Mensal', price: 200 }],
      bankAccounts: [{ bankName: 'Nubank', account: '123', pixKey: '' }],
      cardFees: { pix: { percent: 0, fixed: 0 } },
    };
    const built = buildAcademyFinanceConfigUpdate({ settings: '{}' }, merged, {
      hasSettingsAttribute: true,
    });
    expect(built.bankAccountsOffloaded).toBe(false);
    const parsed = JSON.parse(built.financeConfig);
    expect(parsed.bankAccounts).toHaveLength(1);
  });

  it('offloads bank accounts to root attribute when financeConfig exceeds legacy limit', () => {
    const plans = [{ name: 'Mensal', price: 200 }];
    const banks = Array.from({ length: 4 }, (_, i) => ({
      bankName: `Banco ${i}`,
      account: String(1000 + i),
      branch: String(i),
      pixKey: `pix-${i}@mail.com`,
    }));
    const merged = {
      plans,
      bankAccounts: banks,
      cardFees: { pix: { percent: 0, fixed: 0 } },
      legacyBlob: 'z'.repeat(1800),
    };
    const built = buildAcademyFinanceConfigUpdate({}, merged, {
      hasSettingsAttribute: true,
    });
    expect(built.bankAccountsOffloaded).toBe(true);
    expect(built.bankAccountsOffloadVia).toBe('root');
    expect(JSON.parse(built.financeConfig).bankAccounts).toEqual([]);
    expect(JSON.parse(built.financeBankAccounts)).toHaveLength(4);
  });

  it('offloads bank accounts to root attribute when settings is unavailable', () => {
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
      legacyBlob: 'z'.repeat(2000),
    };
    const built = buildAcademyFinanceConfigUpdate(
      { settings: '{}', onboardingChecklist: '[]' },
      merged,
      { hasSettingsAttribute: false }
    );
    expect(built.bankAccountsOffloaded).toBe(true);
    expect(built.bankAccountsOffloadVia).toBe('root');
    expect(JSON.parse(built.financeConfig).bankAccounts).toEqual([]);
    expect(JSON.parse(built.financeBankAccounts)).toHaveLength(6);
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

  it('coerceBankAccountList aceita array de rótulos string', () => {
    const list = coerceBankAccountList(['Nubank · 1', 'PIX chave@test.com']);
    expect(list).toHaveLength(2);
    expect(list[0].bankName).toBe('Nubank');
  });

  it('enrichFinanceConfigWithOrphanLabels sintetiza contas de rótulos históricos', () => {
    const cfg = enrichFinanceConfigWithOrphanLabels(
      { plans: [], bankAccounts: [] },
      ['Sicoob · 123', 'Caixinha']
    );
    expect(cfg.bankAccounts.map((a) => a.bankName).sort()).toEqual(['Caixinha', 'Sicoob']);
  });

  it('mergeFinanceConfigFromAcademyDoc recupera contas de rótulos em formas de pagamento', () => {
    const doc = {
      financeConfig: JSON.stringify({
        plans: [],
        bankAccounts: [],
        defaultAccountByMethod: { pix: 'Sicoob · 999' },
        paymentMethodSettings: {
          dinheiro: { active: true, defaultBankAccountLabel: 'Caixinha' },
        },
      }),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.bankAccounts.map((a) => a.bankName).sort()).toEqual(['Caixinha', 'Sicoob']);
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

  it('offloads plans to settings when financeConfig exceeds target limit even without banks', () => {
    const plans = Array.from({ length: 8 }, (_, i) => ({
      name: `Plano longo ${i}`,
      price: 100 + i,
      description: 'd'.repeat(800),
      applyCardFee: true,
    }));
    const merged = {
      plans,
      bankAccounts: [],
      cardFees: { pix: { percent: 0, fixed: 0 } },
      collectionRules: [{ day: 1, label: '1ª', defaultMessage: 'm'.repeat(200), escalate: false }],
      legacyBlob: 'z'.repeat(2000),
    };
    const built = buildAcademyFinanceConfigUpdate({ settings: '{}' }, merged, {
      hasSettingsAttribute: true,
    });
    expect(built.plansOffloaded).toBe(true);
    expect(JSON.parse(built.financeConfig).plans).toEqual([]);
    const settings = JSON.parse(built.settings);
    expect(settings.financePlans).toHaveLength(8);
    const cfg = mergeFinanceConfigFromAcademyDoc({
      financeConfig: built.financeConfig,
      settings: built.settings,
    });
    expect(cfg.plans).toHaveLength(9);
    expect(cfg.plans.some((p) => p.name === 'Isento' && p.isExempt === true)).toBe(true);
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
    expect(cfg.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Mensal', price: 150 }),
        expect.objectContaining({ name: 'Isento', isExempt: true }),
      ])
    );
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
    expect(cfg.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Mensal', price: 150 }),
        expect.objectContaining({ name: 'Isento', isExempt: true }),
      ])
    );
  });

  it('mergeFinanceConfigFromAcademyDoc unions plans from inline financeConfig and settings overflow', () => {
    const doc = {
      financeConfig: JSON.stringify({
        plans: [{ name: 'Plano antigo', price: 120 }],
        bankAccounts: [],
      }),
      settings: JSON.stringify({
        financePlansOffloaded: true,
        financePlans: [{ name: 'Plano novo', price: 200 }],
      }),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.plans.map((p) => p.name).sort()).toEqual(['Isento', 'Plano antigo', 'Plano novo']);
  });

  it('unionFinanceConfigForPersist keeps legacy plans and banks from server when client payload is partial', () => {
    const server = {
      plans: [{ name: 'Antigo', price: 100 }],
      bankAccounts: [{ bankName: 'Sicoob', account: '1' }],
    };
    const client = {
      plans: [{ name: 'Novo', price: 200 }],
      bankAccounts: [],
    };
    const merged = unionFinanceConfigForPersist(server, client);
    expect(merged.plans.map((p) => p.name).sort()).toEqual(['Antigo', 'Novo']);
    expect(merged.bankAccounts).toEqual([expect.objectContaining({ bankName: 'Sicoob', account: '1' })]);
  });

  it('mergeFinanceConfigFromAcademyDoc unions banks from inline financeConfig and settings overflow', () => {
    const doc = {
      financeConfig: JSON.stringify({
        plans: [],
        bankAccounts: [{ bankName: 'BB', account: '111' }],
      }),
      settings: JSON.stringify({
        financeBankAccountsOffloaded: true,
        financeBankAccounts: [{ bankName: 'Nubank', account: '222' }],
      }),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.bankAccounts.map((b) => b.bankName).sort()).toEqual(['BB', 'Nubank']);
  });

  it('mergeFinanceConfigFromAcademyDoc reads offloaded bank accounts from settings', () => {
    const doc = {
      financeConfig: JSON.stringify({ plans: [], bankAccounts: [] }),
      settings: JSON.stringify({
        financeBankAccountsOffloaded: true,
        financeBankAccounts: [{ bankName: 'Sicoob', account: '12345-6' }],
      }),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.bankAccounts).toEqual([
      expect.objectContaining({ bankName: 'Sicoob', account: '12345-6' }),
    ]);
  });

  it('mergeFinanceConfigFromAcademyDoc falls back to financeConfig banks when offload flag is set but settings list is empty', () => {
    const doc = {
      financeConfig: JSON.stringify({
        plans: [],
        bankAccounts: [{ bankName: 'Nubank', account: '999' }],
      }),
      settings: JSON.stringify({
        financeBankAccountsOffloaded: true,
        financeBankAccounts: [],
      }),
    };
    const cfg = mergeFinanceConfigFromAcademyDoc(doc);
    expect(cfg.bankAccounts).toEqual([
      expect.objectContaining({ bankName: 'Nubank', account: '999' }),
    ]);
  });

  it('throws when lean financeConfig still exceeds limit', () => {
    const merged = { plans: [], bankAccounts: [], extraPayload: 'y'.repeat(17000) };
    expect(() => buildAcademyFinanceConfigUpdate({}, merged)).toThrow(FinanceConfigTooLargeError);
  });

  it('compactFinanceConfigForStorage strips legacy acquirerFees when feeReceivers exist', () => {
    const receiver = defaultFeeReceiver({
      name: 'PagBank',
      fees: {
        ...emptyFeeReceiverFeeTable(),
        pix: { percent: 1, fixed: 0 },
      },
    });
    const compact = compactFinanceConfigForStorage({
      acquirerFees: { pix: { percent: 99, fixed: 0 } },
      feeReceivers: [receiver],
      defaultFeeReceiverId: receiver.id,
      feeReceiversMigrated: true,
      bankAccounts: [
        {
          bankName: 'Nubank',
          account: '1',
          useDefaultAcquirerFees: false,
          acquirerFees: { pix: { percent: 50, fixed: 0 } },
          feeReceiverId: receiver.id,
        },
      ],
    });
    expect(compact).not.toHaveProperty('acquirerFees');
    expect(compact.bankAccounts[0]).not.toHaveProperty('acquirerFees');
    expect(compact.feeReceivers).toHaveLength(1);
    expect(JSON.stringify(compact).length).toBeLessThan(FINANCE_CONFIG_LEGACY_MAX_CHARS);
  });

  it('keeps feeReceivers inline when under target limit', () => {
    const receivers = Array.from({ length: 4 }, (_, i) =>
      defaultFeeReceiver({
        name: `Recebedor ${i}`,
        fees: {
          ...emptyFeeReceiverFeeTable(),
          pix: { percent: 1 + i * 0.1, fixed: 0 },
          debito: { default: { percent: 2, fixed: 0 }, visa: { percent: 2.1, fixed: 0 } },
        },
      })
    );
    const merged = {
      plans: [{ name: 'Mensal', price: 100 }],
      bankAccounts: [],
      feeReceivers: receivers,
      defaultFeeReceiverId: receivers[0].id,
      feeReceiversMigrated: true,
    };
    const built = buildAcademyFinanceConfigUpdate({ settings: '{}' }, merged, {
      hasSettingsAttribute: true,
    });
    expect(built.feeReceiversOffloaded).toBeFalsy();
    expect(JSON.parse(built.financeConfig).feeReceivers).toHaveLength(4);
    expect(built.financeConfig.length).toBeLessThan(FINANCE_CONFIG_LEGACY_MAX_CHARS);
  });

  it('offloads feeReceivers to settings when config exceeds legacy limit', () => {
    const receivers = Array.from({ length: 4 }, (_, i) =>
      defaultFeeReceiver({
        name: `Recebedor ${i}`,
        fees: {
          ...emptyFeeReceiverFeeTable(),
          pix: { percent: 1 + i * 0.1, fixed: 0 },
          debito: { default: { percent: 2, fixed: 0 }, visa: { percent: 2.1, fixed: 0 } },
        },
      })
    );
    const merged = {
      plans: [{ name: 'Mensal', price: 100 }],
      bankAccounts: [],
      feeReceivers: receivers,
      defaultFeeReceiverId: receivers[0].id,
      feeReceiversMigrated: true,
      legacyBlob: 'x'.repeat(1800),
    };
    const built = buildAcademyFinanceConfigUpdate({ settings: '{}' }, merged, {
      hasSettingsAttribute: true,
    });
    expect(built.feeReceiversOffloaded).toBe(true);
    const parsed = JSON.parse(built.financeConfig);
    expect(parsed.feeReceivers || []).toHaveLength(0);
    const settings = JSON.parse(built.settings);
    expect(settings.financeFeeReceivers.receivers).toHaveLength(4);
    const cfg = mergeFinanceConfigFromAcademyDoc({
      financeConfig: built.financeConfig,
      settings: built.settings,
    });
    expect(readFeeReceivers(cfg)).toHaveLength(4);
  });

  it('offloads feeReceivers to settings even when academy doc has no settings key yet', () => {
    const receivers = Array.from({ length: 3 }, (_, i) =>
      defaultFeeReceiver({
        name: `Recebedor ${i}`,
        fees: {
          ...emptyFeeReceiverFeeTable(),
          pix: { percent: 1 + i * 0.1, fixed: 0 },
        },
      })
    );
    const merged = {
      plans: [{ name: 'Mensal', price: 100 }],
      bankAccounts: [{ bankName: 'Nubank', account: '1', pixKey: '' }],
      feeReceivers: receivers,
      defaultFeeReceiverId: receivers[0].id,
      feeReceiversMigrated: true,
      legacyBlob: 'x'.repeat(1800),
    };
    const built = buildAcademyFinanceConfigUpdate({}, merged);
    expect(built.feeReceiversOffloaded).toBe(true);
    expect(built.settings).toBeTruthy();
  });
});
