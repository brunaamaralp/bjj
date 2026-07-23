import { describe, expect, it } from 'vitest';
import {
  backfillPatchForExistingPayment,
  buildPendingPaymentFields,
  computeExpectedAmountForMaterialization,
  computeDueDateForMaterialization,
  referenceMonthSaoPaulo,
  resolveMaterializationStatus,
  shouldMaterializeStudentForMonth,
} from '../../lib/studentPaymentMaterialization.js';

const financeConfig = {
  plans: [{ name: 'Mensal', price: 200, isExempt: false }],
};

const activeStudent = {
  id: 'stu-1',
  _isStudent: true,
  studentStatus: 'active',
  plan: 'Mensal',
  enrollmentDate: '2025-01-10',
  dueDay: 10,
  discountType: 'none',
  discountAmount: 0,
};

describe('shouldMaterializeStudentForMonth', () => {
  it('aceita aluno ativo com plano mensal', () => {
    expect(shouldMaterializeStudentForMonth({ student: activeStudent, referenceMonth: '2026-04', financeConfig })).toEqual({
      skip: false,
    });
  });

  it('pula inativo', () => {
    expect(
      shouldMaterializeStudentForMonth({
        student: { ...activeStudent, studentStatus: 'inactive' },
        referenceMonth: '2026-04',
        financeConfig,
      })
    ).toEqual({ skip: true, reason: 'inactive' });
  });

  it('pula sem plano', () => {
    expect(
      shouldMaterializeStudentForMonth({
        student: { ...activeStudent, plan: '' },
        referenceMonth: '2026-04',
        financeConfig,
      })
    ).toEqual({ skip: true, reason: 'no_plan' });
  });

  it('pula plano isento', () => {
    const cfg = { plans: [{ name: 'Bolsa', price: 0, isExempt: true }] };
    expect(
      shouldMaterializeStudentForMonth({
        student: { ...activeStudent, plan: 'Bolsa' },
        referenceMonth: '2026-04',
        financeConfig: cfg,
      })
    ).toEqual({ skip: true, reason: 'exempt_plan' });
  });

  it('pula plano anual', () => {
    expect(
      shouldMaterializeStudentForMonth({
        student: { ...activeStudent, plan: 'Plano Anual' },
        referenceMonth: '2026-04',
        financeConfig,
      })
    ).toEqual({ skip: true, reason: 'annual_plan' });
  });

  it('pula mês anterior à matrícula', () => {
    expect(
      shouldMaterializeStudentForMonth({
        student: { ...activeStudent, enrollmentDate: '2026-03-15' },
        referenceMonth: '2026-02',
        financeConfig,
      })
    ).toEqual({ skip: true, reason: 'before_enrollment' });
  });
});

describe('resolveMaterializationStatus', () => {
  it('pending quando sem freeze', () => {
    expect(resolveMaterializationStatus([], '2026-04')).toBe('pending');
  });

  it('frozen quando freeze cobre o mês', () => {
    const freezes = [{ start_date: '2026-04-01', end_date: '2026-04-30' }];
    expect(resolveMaterializationStatus(freezes, '2026-04')).toBe('frozen');
  });
});

describe('buildPendingPaymentFields', () => {
  it('gera billing_reference_id determinístico e campos pending', () => {
    const fields = buildPendingPaymentFields({
      leadId: 'stu-1',
      academyId: 'ac-1',
      referenceMonth: '2026-04',
      planName: 'Mensal',
      expectedAmount: 200,
      dueDate: '2026-04-10',
      issuedAt: '2026-04-01T12:00:00.000Z',
    });
    expect(fields.status).toBe('pending');
    expect(fields.billing_reference_id).toBe('nave:1:ac-1:student:stu-1:2026-04');
    expect(fields.expected_amount).toBe(200);
    expect(fields.issued_at).toBe('2026-04-01T12:00:00.000Z');
    expect(fields.registered_by).toBe('system');
    expect(fields.payment_category).toBe('plan');
  });
});

describe('backfillPatchForExistingPayment', () => {
  it('pending existente: preenche billing_reference_id ausente', () => {
    const patch = backfillPatchForExistingPayment(
      { $id: 'sp-1', status: 'pending' },
      {
        billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-04',
        issued_at: '2026-04-01T12:00:00.000Z',
        expected_amount: 200,
        due_date: '2026-04-10',
        plan_name: 'Mensal',
      }
    );
    expect(patch).toEqual({
      billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-04',
      issued_at: '2026-04-01T12:00:00.000Z',
      expected_amount: 200,
      due_date: '2026-04-10',
      plan_name: 'Mensal',
    });
  });

  it('paid existente: só backfill billing_reference_id e issued_at', () => {
    const patch = backfillPatchForExistingPayment(
      { $id: 'sp-1', status: 'paid', amount: 200 },
      {
        billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-04',
        issued_at: '2026-04-01T12:00:00.000Z',
        expected_amount: 150,
        status: 'pending',
      }
    );
    expect(patch).toEqual({
      billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-04',
      issued_at: '2026-04-01T12:00:00.000Z',
    });
    expect(patch.status).toBeUndefined();
  });

  it('doc completo retorna null', () => {
    const patch = backfillPatchForExistingPayment(
      {
        $id: 'sp-1',
        status: 'pending',
        billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-04',
        issued_at: '2026-04-01T12:00:00.000Z',
        expected_amount: 200,
      },
      { billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-04' }
    );
    expect(patch).toBeNull();
  });
});

describe('computeExpectedAmountForMaterialization', () => {
  it('aplica desconto percentual do aluno', () => {
    const amount = computeExpectedAmountForMaterialization(
      { ...activeStudent, discountType: 'percent', discountAmount: 10 },
      financeConfig
    );
    expect(amount).toBe(180);
  });

  it('computeExpectedAmountForMaterialization uses plan_price snapshot', () => {
    const student = { plan: 'Mensal', plan_price: 180, student_status: 'active' };
    const cfg = { plans: [{ name: 'Mensal', price: 250 }] };
    expect(computeExpectedAmountForMaterialization(student, cfg)).toBe(180);
  });
});

describe('computeDueDateForMaterialization', () => {
  it('usa due_day do aluno no mês de referência', () => {
    expect(computeDueDateForMaterialization(activeStudent, '2026-04')).toBe('2026-04-10');
  });
});

describe('referenceMonthSaoPaulo', () => {
  it('retorna YYYY-MM', () => {
    const ym = referenceMonthSaoPaulo(new Date('2026-04-15T15:00:00.000Z'));
    expect(ym).toMatch(/^\d{4}-\d{2}$/);
  });
});
