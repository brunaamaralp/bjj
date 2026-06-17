import { describe, it, expect } from 'vitest';
import {
  readPaymentMethodSettings,
  normalizePaymentMethodSettings,
  listActivePaymentMethods,
  isPaymentMethodActive,
  isPaymentMethodConfigured,
  paymentMethodsConfiguredSummary,
  orderedActiveStorageDialectMethodsForModal,
  storageDialectPaymentMethodOptionsForFinance,
} from '../lib/paymentMethodSettings.js';
import { readDefaultAccountByMethod } from '../lib/paymentMethodBankDefaults.js';

const cfg = {
  bankAccounts: [
    { bankName: 'Banco do Brasil', account: '111' },
    { bankName: 'Caixinha' },
  ],
  defaultAccountByMethod: {
    pix: 'Banco do Brasil · 111',
    dinheiro: 'Caixinha',
  },
};

describe('paymentMethodSettings', () => {
  it('readPaymentMethodSettings migra defaultAccountByMethod legado', () => {
    const settings = readPaymentMethodSettings(cfg);
    expect(settings.pix.defaultBankAccountLabel).toBe('Banco do Brasil · 111');
    expect(settings.dinheiro.defaultBankAccountLabel).toBe('Caixinha');
    expect(settings.pix.active).toBe(true);
    expect(settings.cartao_credito.autoSettle).toBe(false);
    expect(settings.pix.autoSettle).toBe(true);
  });

  it('readDefaultAccountByMethod delega para paymentMethodSettings', () => {
    expect(readDefaultAccountByMethod(cfg)).toEqual({
      pix: 'Banco do Brasil · 111',
      dinheiro: 'Caixinha',
    });
  });

  it('listActivePaymentMethods exclui formas inativas', () => {
    const active = listActivePaymentMethods({
      ...cfg,
      paymentMethodSettings: { transferencia: { active: false } },
    });
    expect(active.map((m) => m.value)).not.toContain('transferencia');
    expect(active.map((m) => m.value)).toContain('pix');
  });

  it('isPaymentMethodConfigured exige conta mapeada quando há várias contas', () => {
    expect(isPaymentMethodConfigured(cfg, 'pix')).toBe(true);
    expect(isPaymentMethodConfigured(cfg, 'cartao_credito')).toBe(false);
    expect(
      isPaymentMethodConfigured(
        {
          bankAccounts: [{ bankName: 'Única' }],
          paymentMethodSettings: {},
        },
        'pix'
      )
    ).toBe(true);
  });

  it('normalizePaymentMethodSettings remove conta fantasma', () => {
    const out = normalizePaymentMethodSettings({
      bankAccounts: cfg.bankAccounts,
      paymentMethodSettings: {
        pix: {
          active: true,
          defaultBankAccountLabel: 'Conta inexistente',
          autoSettle: true,
          autoMarkReceived: true,
        },
      },
    });
    expect(out.pix.defaultBankAccountLabel).toBeUndefined();
  });

  it('paymentMethodsConfiguredSummary conta ativas configuradas', () => {
    const summary = paymentMethodsConfiguredSummary(cfg);
    expect(summary.active).toBe(6);
    expect(summary.configured).toBe(2);
  });

  it('orderedActiveStorageDialectMethodsForModal filtra inativas', () => {
    const list = orderedActiveStorageDialectMethodsForModal({
      ...cfg,
      paymentMethodSettings: {
        dinheiro: { active: false },
        pix: { active: true, defaultBankAccountLabel: 'Banco do Brasil · 111' },
        cartao_debito: { active: true },
        cartao_credito: { active: true },
        transferencia: { active: true },
        outro: { active: true },
      },
    });
    expect(list.map((o) => o.value)).not.toContain('dinheiro');
    expect(list[0].value).toBe('pix');
  });

  it('isPaymentMethodActive aceita dialect e canônico', () => {
    const inactive = {
      ...cfg,
      paymentMethodSettings: { pix: { active: false } },
    };
    expect(isPaymentMethodActive(inactive, 'pix')).toBe(false);
    expect(isPaymentMethodActive(cfg, 'pix')).toBe(true);
    expect(isPaymentMethodActive(inactive, 'cartão_crédito')).toBe(true);
  });

  it('storageDialectPaymentMethodOptionsForFinance filtra inativas', () => {
    const opts = storageDialectPaymentMethodOptionsForFinance({
      ...cfg,
      paymentMethodSettings: { transferencia: { active: false } },
    });
    expect(opts.map((o) => o.canonical)).not.toContain('transferencia');
    expect(opts.some((o) => o.value === 'transferência')).toBe(false);
  });
});
