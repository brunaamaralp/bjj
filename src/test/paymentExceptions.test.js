import { describe, it, expect } from 'vitest';
import {
  analyzePaymentException,
  amountMatchesAnyPlan,
  isPaymentExceptionResolved,
  readExceptionStatusLabels,
  mergeExceptionLabelsIntoFinanceConfig,
} from '../lib/paymentExceptions.js';

const financeConfig = {
  plans: [
    { name: 'Mensal', price: 200 },
    { name: 'Faixa', price: 79.9 },
  ],
};

const student = { id: 's1', name: 'Aluno', plan: 'Mensal', dueDay: 5 };

describe('paymentExceptions', () => {
  it('flags awaiting as exception', () => {
    const payment = { status: 'awaiting', expected_amount: 200, paid_amount: 0 };
    const r = analyzePaymentException(student, payment, '2026-05', financeConfig, new Date('2026-05-10'));
    expect(r.isException).toBe(true);
    expect(r.reasons).toContain('awaiting');
    expect(r.primaryStatus).toBe('awaiting');
  });

  it('flags partial as exception', () => {
    const payment = { status: 'partial', expected_amount: 200, paid_amount: 80 };
    const r = analyzePaymentException(student, payment, '2026-05', financeConfig, new Date('2026-05-10'));
    expect(r.isException).toBe(true);
    expect(r.reasons).toContain('partial');
    expect(r.difference).toBe(120);
  });

  it('flags active student without payment before due as none', () => {
    const r = analyzePaymentException(student, null, '2026-05', financeConfig, new Date('2026-05-03'));
    expect(r.isException).toBe(true);
    expect(r.reasons).toContain('none');
    expect(r.primaryStatus).toBe('none');
  });

  it('flags overdue pending', () => {
    const payment = { status: 'pending', expected_amount: 200, paid_amount: 0 };
    const r = analyzePaymentException(student, payment, '2026-05', financeConfig, new Date('2026-05-20'));
    expect(r.isException).toBe(true);
    expect(r.reasons).toContain('pending');
  });

  it('detects divergence when paid amount does not match any plan', () => {
    const payment = { status: 'paid', expected_amount: 200, paid_amount: 79.9 };
    const r = analyzePaymentException(student, payment, '2026-05', financeConfig, new Date('2026-05-10'));
    expect(r.isException).toBe(true);
    expect(r.reasons).toContain('divergence');
  });

  it('paid with full amount is not an exception', () => {
    const payment = { status: 'paid', expected_amount: 200, paid_amount: 200 };
    const r = analyzePaymentException(student, payment, '2026-05', financeConfig, new Date('2026-05-10'));
    expect(r.isException).toBe(false);
  });

  it('clears exception when paid with zero difference', () => {
    const payment = { status: 'paid', expected_amount: 200, paid_amount: 200 };
    expect(isPaymentExceptionResolved(student, payment, '2026-05', financeConfig, new Date('2026-05-10'))).toBe(
      true
    );
  });

  it('amountMatchesAnyPlan', () => {
    expect(amountMatchesAnyPlan(financeConfig, 79.9)).toBe(true);
    expect(amountMatchesAnyPlan(financeConfig, 150)).toBe(false);
  });

  it('read and merge exception labels', () => {
    const cfg = { exceptionStatusLabels: { pending: 'Em atraso' } };
    expect(readExceptionStatusLabels(cfg).pending).toBe('Em atraso');
    const merged = mergeExceptionLabelsIntoFinanceConfig(cfg, { awaiting: 'Aguardando confirmação' });
    expect(merged.exceptionStatusLabels.awaiting).toBe('Aguardando confirmação');
  });
});
