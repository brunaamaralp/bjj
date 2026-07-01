import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  syncStudentOverdueAfterPayment: vi.fn(),
  scheduleControlIdOverdueReconcile: vi.fn(),
}));

vi.mock('./studentOverdueSync.js', () => ({
  syncStudentOverdueAfterPayment: (...args) => mocks.syncStudentOverdueAfterPayment(...args),
}));

vi.mock('./controlidOverdueAccess.js', () => ({
  scheduleControlIdOverdueReconcile: (...args) => mocks.scheduleControlIdOverdueReconcile(...args),
}));

import {
  centsToReais,
  resolveDueDateForReferenceMonth,
  upsertStudentPaymentFromPagbank,
} from '../upsertStudentPaymentFromPagbank.js';

const DB = 'db-test';
const COL = 'student_payments';

describe('centsToReais', () => {
  it('converte centavos PagBank para reais', () => {
    expect(centsToReais(15000)).toBe(150);
    expect(centsToReais(99)).toBe(0.99);
  });
});

describe('resolveDueDateForReferenceMonth', () => {
  it('usa due_day do aluno no mês de referência', () => {
    const due = resolveDueDateForReferenceMonth({ due_day: 10 }, '2026-03');
    expect(due).toMatch(/^2026-03-10$/);
  });
});

describe('upsertStudentPaymentFromPagbank', () => {
  const databases = () => ({
    listDocuments: mocks.listDocuments,
    createDocument: mocks.createDocument,
    updateDocument: mocks.updateDocument,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = COL;
    mocks.createDocument.mockResolvedValue({ $id: 'sp-new', status: 'paid' });
    mocks.updateDocument.mockResolvedValue({ $id: 'sp-existing', status: 'paid' });
    mocks.listDocuments.mockResolvedValue({ documents: [], total: 0 });
  });

  it('sem registro no mês → cria paid em reais', async () => {
    const out = await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      financialTxId: 'tx-1',
      paidAt: '2026-03-05T10:00:00.000Z',
      status: 'paid',
      studentDoc: { plan: 'Adulto Mensal' },
    });

    expect(out.created).toBe(true);
    expect(mocks.createDocument).toHaveBeenCalledWith(
      DB,
      COL,
      expect.any(String),
      expect.objectContaining({
        lead_id: 'stu-1',
        status: 'paid',
        amount: 150,
        paid_amount: 150,
        method: 'pagbank',
        payment_category: 'plan',
        financial_tx_id: 'tx-1',
      })
    );
  });

  it('pending existente → atualiza para paid', async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [{ $id: 'sp-pend', status: 'pending', payment_category: 'plan' }],
      total: 1,
    });

    await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      financialTxId: 'tx-2',
      paidAt: '2026-03-05T10:00:00.000Z',
      status: 'paid',
    });

    expect(mocks.updateDocument).toHaveBeenCalledWith(
      DB,
      COL,
      'sp-pend',
      expect.objectContaining({ status: 'paid', amount: 150 })
    );
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it('falha definitiva sem registro → cria pending com due_date', async () => {
    await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      financialTxId: null,
      paidAt: null,
      status: 'pending',
      studentDoc: { due_day: 5 },
    });

    expect(mocks.createDocument).toHaveBeenCalledWith(
      DB,
      COL,
      expect.any(String),
      expect.objectContaining({
        status: 'pending',
        due_date: '2026-03-05',
        paid_at: null,
      })
    );
  });

  it('falha definitiva com paid existente → não sobrescreve com pending', async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [{ $id: 'sp-paid', status: 'paid', payment_category: 'plan' }],
      total: 1,
    });

    const out = await upsertStudentPaymentFromPagbank({
      databases: {
        listDocuments: mocks.listDocuments,
        createDocument: mocks.createDocument,
        updateDocument: mocks.updateDocument,
      },
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      financialTxId: null,
      paidAt: null,
      status: 'pending',
    });

    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('already_settled');
    expect(mocks.updateDocument).not.toHaveBeenCalled();
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });
});
