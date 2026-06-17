import { describe, it, expect } from 'vitest';
import {
  resolveFinancialTxSettlement,
  applyAutoMarkReceivedToPaymentStatus,
  resolveCreditDaysFromSettings,
  isoEndOfDayUtc,
  financialTxSettlementFields,
} from '../lib/paymentSettlement.js';

const cfg = {
  bankAccounts: [{ bankName: 'Conta' }],
  paymentMethodSettings: {
    pix: { active: true, autoSettle: true, autoMarkReceived: true, creditDays: 0 },
    cartao_credito: {
      active: true,
      autoSettle: false,
      autoMarkReceived: true,
      creditDays: 30,
      defaultBankAccountLabel: 'Conta',
    },
    boleto: { active: false, autoSettle: false, autoMarkReceived: false, creditDays: 0 },
    transferencia: { active: true, autoSettle: true, autoMarkReceived: false, creditDays: 0 },
  },
};

describe('paymentSettlement', () => {
  it('resolveFinancialTxSettlement: PIX liquida na hora', () => {
    const s = resolveFinancialTxSettlement({
      financeConfig: cfg,
      method: 'pix',
      paidAt: '2026-06-01T12:00:00.000Z',
    });
    expect(s.status).toBe('settled');
    expect(s.settledAt).toBe('2026-06-01T12:00:00.000Z');
    expect(s.expected_settlement_at).toBeNull();
  });

  it('resolveFinancialTxSettlement: crédito autoSettle false fica pendente', () => {
    const s = resolveFinancialTxSettlement({
      financeConfig: cfg,
      method: 'cartao_credito',
      paidAt: '2026-06-01T12:00:00.000Z',
    });
    expect(s.status).toBe('pending');
    expect(s.settledAt).toBeNull();
    expect(s.expected_settlement_at).toBe(isoEndOfDayUtc('2026-07-01'));
    expect(s.creditDays).toBe(30);
  });

  it('resolveFinancialTxSettlement: autoSettle true com creditDays mantém settled', () => {
    const s = resolveFinancialTxSettlement({
      financeConfig: {
        ...cfg,
        paymentMethodSettings: {
          cartao_debito: {
            active: true,
            autoSettle: true,
            creditDays: 1,
            defaultBankAccountLabel: 'Conta',
          },
        },
      },
      method: 'cartao_debito',
      paidAt: '2026-06-01T12:00:00.000Z',
    });
    expect(s.status).toBe('settled');
    expect(s.expected_settlement_at).toBe(isoEndOfDayUtc('2026-06-02'));
  });

  it('applyAutoMarkReceivedToPaymentStatus respeita forma com autoMarkReceived false', () => {
    expect(applyAutoMarkReceivedToPaymentStatus('paid', 'transferencia', cfg)).toBe('pending');
    expect(applyAutoMarkReceivedToPaymentStatus('paid', 'pix', cfg)).toBe('paid');
    expect(applyAutoMarkReceivedToPaymentStatus('awaiting', 'pix', cfg)).toBe('awaiting');
  });

  it('resolveCreditDaysFromSettings lê dialect', () => {
    expect(resolveCreditDaysFromSettings(cfg, 'cartão_crédito')).toBe(30);
  });

  it('financialTxSettlementFields expõe status para espelho de venda', () => {
    const fields = financialTxSettlementFields({
      financeConfig: cfg,
      method: 'cartao_credito',
      paidAt: '2026-06-01T12:00:00.000Z',
    });
    expect(fields.status).toBe('pending');
    expect(fields.settledAt).toBeNull();
    expect(fields.expected_settlement_at).toBe(isoEndOfDayUtc('2026-07-01'));
  });
});
