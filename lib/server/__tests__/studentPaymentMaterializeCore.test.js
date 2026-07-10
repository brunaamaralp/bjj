import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findStudentPaymentForMonth: vi.fn(),
  fetchActiveFreezesForStudent: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock('../studentPaymentLookup.js', () => ({
  findStudentPaymentForMonth: (...args) => mocks.findStudentPaymentForMonth(...args),
}));

vi.mock('../planFreezeLookup.js', () => ({
  fetchActiveFreezesForStudent: (...args) => mocks.fetchActiveFreezesForStudent(...args),
}));

import { materializeStudentPaymentForMonth } from '../studentPaymentMaterializeCore.js';

const DB = 'db-test';
const COL = 'student_payments';

const student = {
  id: 'stu-1',
  _isStudent: true,
  studentStatus: 'active',
  plan: 'Mensal',
  enrollmentDate: '2025-01-10',
  dueDay: 10,
};

const financeConfig = {
  plans: [{ name: 'Mensal', price: 200 }],
};

describe('materializeStudentPaymentForMonth', () => {
  const databases = {
    createDocument: mocks.createDocument,
    updateDocument: mocks.updateDocument,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = COL;
    mocks.fetchActiveFreezesForStudent.mockResolvedValue([]);
    mocks.findStudentPaymentForMonth.mockResolvedValue(null);
    mocks.createDocument.mockImplementation(async (_db, _col, id, payload) => ({
      $id: id || 'sp-new',
      ...payload,
    }));
    mocks.updateDocument.mockImplementation(async (_db, _col, id, patch) => ({ $id: id, ...patch }));
  });

  it('cria pending quando não existe doc', async () => {
    const out = await materializeStudentPaymentForMonth({
      databases,
      dbId: DB,
      student,
      academyId: 'ac-1',
      financeConfig,
      referenceMonth: '2026-04',
      freezes: [],
      issuedAt: '2026-04-01T12:00:00.000Z',
    });

    expect(out.action).toBe('created_pending');
    expect(mocks.createDocument).toHaveBeenCalledWith(
      DB,
      COL,
      expect.any(String),
      expect.objectContaining({
        status: 'pending',
        billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-04',
        expected_amount: 200,
        reference_month: '2026-04',
      })
    );
  });

  it('cria frozen quando freeze cobre o mês', async () => {
    mocks.fetchActiveFreezesForStudent.mockResolvedValue([
      { start_date: '2026-04-01', end_date: '2026-04-30' },
    ]);

    const out = await materializeStudentPaymentForMonth({
      databases,
      dbId: DB,
      student,
      academyId: 'ac-1',
      financeConfig,
      referenceMonth: '2026-04',
      issuedAt: '2026-04-01T12:00:00.000Z',
    });

    expect(out.action).toBe('created_frozen');
    expect(mocks.createDocument).toHaveBeenCalledWith(
      DB,
      COL,
      expect.any(String),
      expect.objectContaining({
        status: 'frozen',
        covered_reason: 'freeze',
        billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-04',
      })
    );
  });

  it('pula paid existente sem sobrescrever', async () => {
    mocks.findStudentPaymentForMonth.mockResolvedValue({
      $id: 'sp-paid',
      status: 'paid',
      amount: 200,
      billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-04',
      issued_at: '2026-03-01T12:00:00.000Z',
    });

    const out = await materializeStudentPaymentForMonth({
      databases,
      dbId: DB,
      student,
      academyId: 'ac-1',
      financeConfig,
      referenceMonth: '2026-04',
      freezes: [],
    });

    expect(out.action).toBe('skipped');
    expect(out.reason).toBe('existing_paid');
    expect(mocks.updateDocument).not.toHaveBeenCalled();
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it('backfill billing_reference_id em paid legado', async () => {
    mocks.findStudentPaymentForMonth.mockResolvedValue({
      $id: 'sp-paid',
      status: 'paid',
      amount: 200,
    });

    const out = await materializeStudentPaymentForMonth({
      databases,
      dbId: DB,
      student,
      academyId: 'ac-1',
      financeConfig,
      referenceMonth: '2026-04',
      freezes: [],
      issuedAt: '2026-04-01T12:00:00.000Z',
    });

    expect(out.action).toBe('backfilled_settled');
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      DB,
      COL,
      'sp-paid',
      expect.objectContaining({
        billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-04',
      })
    );
    expect(mocks.updateDocument.mock.calls[0][3].status).toBeUndefined();
  });

  it('upgrade pending → frozen quando freeze vigente', async () => {
    mocks.findStudentPaymentForMonth.mockResolvedValue({
      $id: 'sp-pending',
      status: 'pending',
      expected_amount: 200,
    });
    mocks.fetchActiveFreezesForStudent.mockResolvedValue([
      { start_date: '2026-04-01', end_date: '2026-04-30' },
    ]);

    const out = await materializeStudentPaymentForMonth({
      databases,
      dbId: DB,
      student,
      academyId: 'ac-1',
      financeConfig,
      referenceMonth: '2026-04',
    });

    expect(out.action).toBe('upgraded_to_frozen');
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      DB,
      COL,
      'sp-pending',
      expect.objectContaining({ status: 'frozen', covered_reason: 'freeze' })
    );
  });
});
