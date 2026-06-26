import { describe, it, expect } from 'vitest';
import {
  resolveGridDisplayStatus,
  expectedAmountForStudent,
  receivedAmountForPayment,
  resolveMensalidadesListValor,
  formatMensalidadesListValor,
  shouldMirrorPaymentToCaixa,
  mirrorGrossForPayment,
  mapDbStatusFromGridForm,
  normalizeProfilePaymentStatus,
  validatePaymentStatusPopoverForm,
  paymentStatusLabelPt,
  paymentTimelineBadge,
} from '../lib/paymentStatus.js';
import { openAmountForStudent } from '../lib/collectionOverdue.js';
import { calcFinalPrice, getStudentDiscountAmount } from '../lib/planBilling.js';

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

  it('paymentStatusLabelPt traduz covered para Coberto', () => {
    expect(paymentStatusLabelPt('covered')).toBe('Coberto');
    expect(paymentTimelineBadge('covered').label).toBe('Coberto');
  });

  it('normalizeProfilePaymentStatus trata covered e frozen como paid', () => {
    expect(normalizeProfilePaymentStatus('covered')).toBe('paid');
    expect(normalizeProfilePaymentStatus('frozen')).toBe('paid');
    expect(normalizeProfilePaymentStatus({ key: 'covered' })).toBe('paid');
    expect(normalizeProfilePaymentStatus('pending')).toBe('pending');
    expect(normalizeProfilePaymentStatus('none')).toBe('none');
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

  it('calcFinalPrice applies fixed discount and clamps at zero', () => {
    expect(calcFinalPrice(200, { discount_type: 'fixed', discount_amount: 30 })).toBe(170);
    expect(calcFinalPrice(200, { discount_type: 'fixed', discount_amount: 250 })).toBe(0);
    expect(calcFinalPrice(200, 30)).toBe(170);
  });

  it('calcFinalPrice applies percent discount', () => {
    expect(calcFinalPrice(200, { discount_type: 'percent', discount_amount: 10 })).toBe(180);
    expect(calcFinalPrice(200, { discount_type: 'percent', discount_amount: 100 })).toBe(0);
  });

  it('calcFinalPrice treats legacy discount_amount without type as fixed', () => {
    expect(calcFinalPrice(200, { discount_amount: 25 })).toBe(175);
  });

  it('getStudentDiscountAmount reads snake and camel case safely', () => {
    expect(getStudentDiscountAmount({ discount_amount: 30 })).toBe(30);
    expect(getStudentDiscountAmount({ discountAmount: 15 })).toBe(15);
    expect(getStudentDiscountAmount({ discount_amount: null })).toBe(0);
  });

  it('openAmountForStudent uses plan price minus fixed discount', () => {
    const discountedStudent = { plan: 'Mensal', dueDay: 15, discount_amount: 30, discount_type: 'fixed' };
    expect(openAmountForStudent(discountedStudent, null, financeConfig)).toBe(170);
  });

  it('openAmountForStudent uses plan price minus percent discount', () => {
    const discountedStudent = { plan: 'Mensal', dueDay: 15, discount_amount: 10, discount_type: 'percent' };
    expect(openAmountForStudent(discountedStudent, null, financeConfig)).toBe(180);
  });

  it('openAmountForStudent respects explicit payment.amount zero', () => {
    const discountedStudent = { plan: 'Mensal', dueDay: 15, discount_amount: 30 };
    expect(openAmountForStudent(discountedStudent, { amount: 0 }, financeConfig)).toBe(0);
  });

  it('expectedAmountForStudent keeps explicit expected_amount precedence over discount', () => {
    const discountedStudent = { plan: 'Mensal', dueDay: 15, discount_amount: 30 };
    expect(
      expectedAmountForStudent(discountedStudent, financeConfig, {
        status: 'pending',
        expected_amount: 140,
      })
    ).toBe(140);
  });

  it('expectedAmountForStudent retorna 0 para plano isento', () => {
    const exemptStudent = { id: 's1', plan: 'Bolsista', dueDay: 10 };
    const exemptConfig = {
      plans: [
        { name: 'Mensal', price: 200, isExempt: false },
        { name: 'Bolsista', price: 0, isExempt: true },
      ],
    };
    expect(expectedAmountForStudent(exemptStudent, exemptConfig, null)).toBe(0);
  });

  it('resolveGridDisplayStatus retorna exempt para plano isento sem pagamento', () => {
    const exemptStudent = { id: 's1', plan: 'Bolsista', dueDay: 10 };
    const exemptConfig = {
      plans: [
        { name: 'Mensal', price: 200, isExempt: false },
        { name: 'Bolsista', price: 0, isExempt: true },
      ],
    };
    const result = resolveGridDisplayStatus(
      exemptStudent,
      null,
      '2026-06',
      new Date('2026-06-20T12:00:00'),
      exemptConfig
    );
    expect(result.key).toBe('exempt');
    expect(result.label).toBe('Isento');
  });

  it('paymentStatusLabelPt traduz exempt para Isento', () => {
    expect(paymentStatusLabelPt('exempt')).toBe('Isento');
  });

  it('receivedAmountForPayment partial uses paid_amount', () => {
    expect(receivedAmountForPayment({ status: 'partial', paid_amount: 79.9, amount: 79.9 })).toBe(79.9);
  });

  it('resolveMensalidadesListValor pending usa valor esperado do plano', () => {
    const valor = resolveMensalidadesListValor(student, null, 'pending', financeConfig);
    expect(valor.kind).toBe('money');
    expect(valor.amount).toBe(200);
  });

  it('resolveMensalidadesListValor partial formata recebido e esperado', () => {
    const payment = { status: 'partial', paid_amount: 80, expected_amount: 200 };
    const valor = resolveMensalidadesListValor(student, payment, 'partial', financeConfig);
    expect(valor.kind).toBe('partial');
    expect(valor.received).toBe(80);
    expect(valor.expected).toBe(200);
    expect(formatMensalidadesListValor(valor, (n) => `R$ ${n}`)).toBe('R$ 80 de R$ 200');
  });

  it('resolveMensalidadesListValor covered retorna label Coberto', () => {
    const valor = resolveMensalidadesListValor(student, { status: 'covered' }, 'covered', financeConfig);
    expect(valor).toEqual({ kind: 'label', label: 'Coberto' });
  });

  it('caixa mirror rules', () => {
    expect(shouldMirrorPaymentToCaixa('awaiting')).toBe(true);
    expect(shouldMirrorPaymentToCaixa('pending')).toBe(true);
    expect(shouldMirrorPaymentToCaixa('paid')).toBe(true);
    expect(shouldMirrorPaymentToCaixa('covered')).toBe(false);
    expect(shouldMirrorPaymentToCaixa('frozen')).toBe(false);
    expect(mirrorGrossForPayment('partial', 80, 200)).toBe(80);
    expect(mirrorGrossForPayment('paid', 200, 200)).toBe(200);
    expect(mirrorGrossForPayment('pending', 0, 200)).toBe(200);
  });

  it('mapDbStatusFromGridForm', () => {
    expect(mapDbStatusFromGridForm('awaiting')).toBe('awaiting');
    expect(mapDbStatusFromGridForm('soon')).toBe('pending');
  });

  it('validatePaymentStatusPopoverForm rejects paid without amount', () => {
    const { errors } = validatePaymentStatusPopoverForm({
      gridStatus: 'paid',
      paidAmount: '',
      paidAt: '2026-05-10',
    });
    expect(errors.paid_amount).toBeTruthy();
  });

  it('validatePaymentStatusPopoverForm rejects paid without date', () => {
    const { errors } = validatePaymentStatusPopoverForm({
      gridStatus: 'paid',
      paidAmount: 'R$ 100,00',
      paidAt: '',
    });
    expect(errors.paid_at).toBeTruthy();
  });
});
