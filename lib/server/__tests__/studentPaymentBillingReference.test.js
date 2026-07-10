import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findStudentPaymentByBillingReference: vi.fn(),
  findStudentPaymentForMonth: vi.fn(),
}));

vi.mock('../studentPaymentLookup.js', () => ({
  findStudentPaymentByBillingReference: (...args) => mocks.findStudentPaymentByBillingReference(...args),
  findStudentPaymentForMonth: (...args) => mocks.findStudentPaymentForMonth(...args),
}));

import {
  buildStudentBillingReferenceId,
  extractPagbankReferenceId,
  parseStudentBillingReferenceId,
  referenceMonthFromIso,
  resolvePagbankBillingContext,
} from '../studentPaymentBillingReference.js';

const DB = 'db-test';
const databases = { listDocuments: vi.fn() };

describe('studentPaymentBillingReference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findStudentPaymentByBillingReference.mockResolvedValue(null);
    mocks.findStudentPaymentForMonth.mockResolvedValue(null);
  });

  it('buildStudentBillingReferenceId gera formato determinístico', () => {
    expect(buildStudentBillingReferenceId('ac-1', 'stu-1', '2026-03')).toBe(
      'nave:1:ac-1:student:stu-1:2026-03'
    );
  });

  it('parseStudentBillingReferenceId extrai academy, student e mês', () => {
    expect(
      parseStudentBillingReferenceId('nave:1:ac-1:student:stu-1:2026-02')
    ).toEqual({
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-02',
    });
  });

  it('referenceMonthFromIso extrai YYYY-MM do ISO', () => {
    expect(referenceMonthFromIso('2026-04-01T03:00:00.000Z')).toBe('2026-04');
  });

  it('extractPagbankReferenceId lê reference_id do payload webhook', () => {
    const ref = extractPagbankReferenceId({
      data: { invoice: { reference_id: 'nave:1:ac-1:student:stu-1:2026-02' } },
    });
    expect(ref).toBe('nave:1:ac-1:student:stu-1:2026-02');
  });

  it('resolve por billing_reference — mês vem do reference, não de paid_at', async () => {
    const ref = 'nave:1:ac-1:student:stu-1:2026-02';
    const existingDoc = { $id: 'sp-feb', reference_month: '2026-02' };
    mocks.findStudentPaymentByBillingReference.mockResolvedValue(existingDoc);

    const ctx = await resolvePagbankBillingContext({
      databases,
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      paidAt: '2026-03-01T10:00:00.000Z',
      body: { data: { invoice: { reference_id: ref } } },
    });

    expect(ctx).toEqual({
      referenceMonth: '2026-02',
      billingReferenceId: ref,
      resolutionMethod: 'billing_reference',
      existingDoc,
    });
    expect(mocks.findStudentPaymentForMonth).not.toHaveBeenCalled();
  });

  it('reference ausente → fallback heurístico por paid_at', async () => {
    mocks.findStudentPaymentForMonth.mockResolvedValue({ $id: 'sp-mar' });

    const ctx = await resolvePagbankBillingContext({
      databases,
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      paidAt: '2026-03-05T10:00:00.000Z',
      body: {},
    });

    expect(ctx.resolutionMethod).toBe('heuristic_fallback');
    expect(ctx.referenceMonth).toBe('2026-03');
    expect(ctx.billingReferenceId).toBe('nave:1:ac-1:student:stu-1:2026-03');
    expect(mocks.findStudentPaymentForMonth).toHaveBeenCalled();
  });
});
