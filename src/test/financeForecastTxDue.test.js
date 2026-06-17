import { describe, it, expect } from 'vitest';
import { forecastTxDueYmd } from '../lib/financeForecastCore.js';
import {
  buildPaymentSettlementHints,
  expectedSettlementYmd,
  txSettlementSubtitle,
} from '../lib/financeTxSettlementDisplay.js';

describe('forecastTxDueYmd', () => {
  it('prioriza expected_settlement_at sobre due_date', () => {
    const due = forecastTxDueYmd(
      { due_date: '2026-05-01', expected_settlement_at: '2026-06-15T23:59:59.999Z' },
      { due_date: '2026-05-01' }
    );
    expect(due).toBe('2026-06-15');
  });

  it('usa due_date quando não há liquidação agendada', () => {
    expect(forecastTxDueYmd({ due_date: '2026-05-20' }, {})).toBe('2026-05-20');
  });

  it('cai em competence_month quando não há datas explícitas', () => {
    expect(forecastTxDueYmd({}, { competence_month: '2026-04' })).toBe('2026-04-28');
  });
});

describe('financeTxSettlementDisplay', () => {
  it('txSettlementSubtitle para pendente com data futura', () => {
    const hint = txSettlementSubtitle(
      { status: 'pending', expected_settlement_at: '2026-12-20T23:59:59.999Z' },
      '2026-06-01'
    );
    expect(hint).toBe('Liquida em 20/12/2026');
  });

  it('txSettlementSubtitle para liquidado com crédito futuro', () => {
    const hint = txSettlementSubtitle(
      { status: 'settled', expected_settlement_at: '2026-07-10T23:59:59.999Z' },
      '2026-06-01'
    );
    expect(hint).toBe('Crédito previsto em 10/07/2026');
  });

  it('expectedSettlementYmd retorna null sem data válida', () => {
    expect(expectedSettlementYmd({})).toBeNull();
  });

  it('buildPaymentSettlementHints — cartão sem autoSettle', () => {
    const financeConfig = {
      paymentMethodSettings: {
        cartao_credito: { autoSettle: false, autoMarkReceived: true, creditDays: 30 },
      },
    };
    const hints = buildPaymentSettlementHints({
      financeConfig,
      method: 'cartao_credito',
      requestedStatus: 'paid',
      paidAt: '2026-06-01T12:00:00.000Z',
    });
    expect(hints.some((h) => /Caixa ficou pendente/i.test(h))).toBe(true);
    expect(hints.some((h) => /01\/07\/2026/.test(h))).toBe(true);
  });

  it('buildPaymentSettlementHints — autoMarkReceived false', () => {
    const financeConfig = {
      paymentMethodSettings: {
        pix: { autoSettle: true, autoMarkReceived: false, creditDays: 0 },
      },
    };
    const hints = buildPaymentSettlementHints({
      financeConfig,
      method: 'pix',
      requestedStatus: 'paid',
    });
    expect(hints.some((h) => /permanece pendente na grade/i.test(h))).toBe(true);
  });
});
