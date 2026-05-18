import { describe, it, expect } from 'vitest';
import {
  resolveGridDisplayStatus,
  expectedAmountForStudent,
  receivedAmountForPayment,
  shouldMirrorPaymentToCaixa,
  mirrorGrossForPayment,
  mapDbStatusFromGridForm,
} from '../lib/paymentStatus.js';

describe('paymentStatus', () => {
  const student = { plan: 'Mensal', dueDay: 15 };
  const financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };

  it('resolveGridDisplayStatus awaiting', () => {
    const payment = { status: 'awaiting', reference_month: '2026-05' };
    const r = resolveGridDisplayStatus(student, payment, '2026-05');
    expect(r.key).toBe('awaiting');
  });

  it('resolveGridDisplayStatus partial', () => {
    const payment = { status: 'partial', paid_amount: 100, expected_amount: 200 };
    const r = resolveGridDisplayStatus(student, payment, '2026-05');
    expect(r.key).toBe('partial');
  });

  it('resolveGridDisplayStatus covered', () => {
    const payment = { status: 'covered', bundle_origin_id: 'anc-1', amount: 200 };
    const r = resolveGridDisplayStatus(student, payment, '2026-05');
    expect(r.key).toBe('covered');
    expect(r.label).toBe('Coberto');
  });

  it('expectedAmountForStudent retorna 0 para covered', () => {
    expect(expectedAmountForStudent(student, financeConfig, { status: 'covered' })).toBe(0);
  });

  it('expectedAmountForStudent from plan', () => {
    expect(expectedAmountForStudent(student, financeConfig, null)).toBe(200);
  });

  it('receivedAmountForPayment partial uses paid_amount', () => {
    expect(receivedAmountForPayment({ status: 'partial', paid_amount: 79.9, amount: 79.9 })).toBe(79.9);
  });

  it('caixa mirror rules', () => {
    expect(shouldMirrorPaymentToCaixa('awaiting')).toBe(false);
    expect(shouldMirrorPaymentToCaixa('paid')).toBe(true);
    expect(mirrorGrossForPayment('partial', 80, 200)).toBe(80);
    expect(mirrorGrossForPayment('paid', 200, 200)).toBe(200);
  });

  it('mapDbStatusFromGridForm', () => {
    expect(mapDbStatusFromGridForm('awaiting')).toBe('awaiting');
    expect(mapDbStatusFromGridForm('soon')).toBe('pending');
  });
});
