import { describe, it, expect } from 'vitest';
import {
  MENSALIDADES_CREDIT_METHOD,
  isMensalidadesCreditMethod,
  normalizeMensalidadesInstallments,
  validateMensalidadesPaymentForm,
  STUDENT_PAY_FIELD_IDS,
  focusFirstStudentPaymentError,
} from '../../../src/lib/mensalidadesPaymentForm.js';
import { PAYMENT_CATEGORY } from '../../../src/lib/studentPayments.js';

describe('normalizeMensalidadesInstallments', () => {
  it('crédito mantém parcelas 1–12', () => {
    expect(normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 3)).toBe(3);
    expect(normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 12)).toBe(12);
    expect(normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 1)).toBe(1);
  });

  it('clamp fora do intervalo', () => {
    expect(normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 0)).toBe(1);
    expect(normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 99)).toBe(12);
  });

  it('não-crédito sempre retorna 1', () => {
    expect(normalizeMensalidadesInstallments('pix', 6)).toBe(1);
    expect(normalizeMensalidadesInstallments('cartão_débito', 3)).toBe(1);
    expect(normalizeMensalidadesInstallments('dinheiro', 12)).toBe(1);
  });
});

describe('isMensalidadesCreditMethod', () => {
  it('reconhece dialect do modal e canônico', () => {
    expect(isMensalidadesCreditMethod('cartão_crédito')).toBe(true);
    expect(isMensalidadesCreditMethod('cartao_credito')).toBe(true);
    expect(isMensalidadesCreditMethod('pix')).toBe(false);
  });
});

describe('validateMensalidadesPaymentForm', () => {
  const financeConfig = {
    bankAccounts: [{ bankName: 'Nubank', account: '12345-6' }],
  };
  const student = { plan: 'Mensal', plan_price: 200 };

  it('rejeita valor zero', () => {
    const { errors } = validateMensalidadesPaymentForm({
      payForm: {
        payment_type: PAYMENT_CATEGORY.PLAN,
        amount: '0,00',
        paid_at: '2026-06-15',
        method: 'pix',
        account: 'Nubank · 12345-6',
      },
      financeConfig,
      student,
    });
    expect(errors.amount).toBeTruthy();
  });

  it('rejeita bundle sem mês de cobertura', () => {
    const { errors } = validateMensalidadesPaymentForm({
      payForm: {
        payment_type: PAYMENT_CATEGORY.BUNDLE,
        bundle_start_month: '',
        amount: '200,00',
        paid_at: '2026-06-15',
        method: 'pix',
        account: 'Nubank · 12345-6',
      },
      financeConfig,
      student,
    });
    expect(errors.bundle_start_month).toBeTruthy();
  });

  it('rejeita sem conta bancária configurada', () => {
    const { errors } = validateMensalidadesPaymentForm({
      payForm: {
        payment_type: PAYMENT_CATEGORY.PLAN,
        amount: '200,00',
        paid_at: '2026-06-15',
        method: 'pix',
        account: '',
      },
      financeConfig: { bankAccounts: [] },
      student,
    });
    expect(errors.account).toMatch(/conta bancária/i);
  });

  it('rejeita valor recebido em dinheiro menor que a mensalidade', () => {
    const { errors } = validateMensalidadesPaymentForm({
      payForm: {
        payment_type: PAYMENT_CATEGORY.PLAN,
        amount: '200,00',
        paid_at: '2026-06-15',
        method: 'dinheiro',
        cash_received: '100,00',
        account: 'Nubank · 12345-6',
      },
      financeConfig,
      student,
    });
    expect(errors.cash_received).toBeTruthy();
  });

  it('aceita valor formatado com R$ (modal do aluno)', () => {
    const { errors, amountNum } = validateMensalidadesPaymentForm({
      payForm: {
        payment_type: PAYMENT_CATEGORY.PLAN,
        amount: 'R$ 200,00',
        paid_at: '2026-06-15',
        method: 'pix',
        account: 'Nubank · 12345-6',
      },
      financeConfig,
      student,
    });
    expect(errors.amount).toBeUndefined();
    expect(amountNum).toBe(200);
  });

  it('não exige data de pagamento quando status é pendente', () => {
    const { errors } = validateMensalidadesPaymentForm({
      payForm: {
        payment_type: PAYMENT_CATEGORY.PLAN,
        status: 'pending',
        amount: '200,00',
        paid_at: '',
        method: 'pix',
        account: 'Nubank · 12345-6',
      },
      financeConfig,
      student,
    });
    expect(errors.paid_at).toBeUndefined();
    expect(errors.amount).toBeUndefined();
  });
});

describe('focusFirstStudentPaymentError', () => {
  it('foca o primeiro campo com erro no modal de pagamento', () => {
    const input = document.createElement('input');
    input.id = STUDENT_PAY_FIELD_IDS.amount;
    document.body.appendChild(input);
    focusFirstStudentPaymentError({ amount: 'Informe um valor maior que zero.' });
    expect(document.activeElement).toBe(input);
    document.body.removeChild(input);
  });
});

describe('cross-module parity with paymentStatus', () => {
  it('parcelado 3x alinha com expectedAmountWithCardFee', async () => {
    const { expectedAmountWithCardFee } = await import('../../../src/lib/paymentStatus.js');
    const financeConfig = {
      plans: [{ name: 'Mensal', price: 200, applyCardFee: true }],
      cardFees: {
        credito_avista: { percent: 5 },
        credito_parcelado: { '3': 8 },
      },
    };
    const student = { plan: 'Mensal' };
    const inst = normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 3);
    expect(
      expectedAmountWithCardFee(student, financeConfig, MENSALIDADES_CREDIT_METHOD, inst, null)
    ).toBe(216);
  });
});
