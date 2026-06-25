import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  createDocument: vi.fn(),
  mirrorStudentPaymentToFinancialTx: vi.fn(),
  assertOrRepairStudentInAcademy: vi.fn(),
  fetchAndValidateTxForReconciliation: vi.fn(),
  buildLearnPayerPayload: vi.fn(),
  rememberPayerAliasForStudent: vi.fn(),
  loadPayerContextByLeadIds: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Query: {},
  ID: { unique: () => 'pay-new' },
  Permission: {
    read: () => 'read',
    update: () => 'update',
  },
  Role: {
    users: () => 'users',
  },
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  databases: {
    getDocument: mocks.getDocument,
    updateDocument: mocks.updateDocument,
    createDocument: mocks.createDocument,
  },
}));

vi.mock('../../lib/server/studentPaymentFinancialTxMirror.js', () => ({
  mirrorStudentPaymentToFinancialTx: mocks.mirrorStudentPaymentToFinancialTx,
}));

vi.mock('../../lib/server/studentAcademyRepair.js', () => ({
  assertOrRepairStudentInAcademy: mocks.assertOrRepairStudentInAcademy,
}));

vi.mock('../../lib/server/bankReconciliationValidation.js', () => ({
  fetchAndValidateTxForReconciliation: mocks.fetchAndValidateTxForReconciliation,
}));

vi.mock('../../lib/server/studentPayerAliasServer.js', () => ({
  buildLearnPayerPayload: mocks.buildLearnPayerPayload,
  rememberPayerAliasForStudent: mocks.rememberPayerAliasForStudent,
}));

vi.mock('../../lib/server/studentPayerContext.js', () => ({
  loadPayerContextByLeadIds: mocks.loadPayerContextByLeadIds,
}));

vi.mock('../../src/lib/paymentStatus.js', () => ({
  expectedAmountWithCardFee: (_student, _financeConfig, _method, _installments, data) => Number(data?.amount) || 0,
}));

vi.mock('../../src/lib/paymentCategories.js', () => ({
  PAYMENT_CATEGORY: {
    PLAN: 'plan',
  },
}));

async function loadModule() {
  vi.resetModules();
  process.env.VITE_APPWRITE_DATABASE_ID = 'db-test';
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = 'student-payments-col';
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID = 'students-col';
  process.env.VITE_APPWRITE_BANK_STATEMENTS_COLLECTION_ID = 'bank-statements-col';
  process.env.VITE_APPWRITE_BANK_STATEMENT_ITEMS_COLLECTION_ID = 'bank-statement-items-col';
  process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'financial-tx-appwrite';
  delete process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID;
  delete process.env.FINANCIAL_TX_COL;
  return import('../../lib/server/bankReconRegisterPayment.js');
}

describe('bankReconRegisterPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertOrRepairStudentInAcademy.mockResolvedValue({
      $id: 'lead-1',
      name: 'Aluno 1',
      plan: 'Adulto',
      due_day: 10,
    });
    mocks.createDocument.mockImplementation(async (_db, _col, id, payload) => ({ $id: id, ...payload }));
    mocks.mirrorStudentPaymentToFinancialTx.mockResolvedValue({ mirrorId: 'tx-1', warning: null });
    mocks.fetchAndValidateTxForReconciliation.mockResolvedValue({
      ok: true,
      mapped: { id: 'tx-1', academyId: 'acad-1' },
    });
    mocks.loadPayerContextByLeadIds.mockResolvedValue(new Map());
    mocks.buildLearnPayerPayload.mockReturnValue(null);
  });

  it('usa APPWRITE_FINANCIAL_TX_COLLECTION_ID para validar a tx conciliada quando VITE e legado nao existem', async () => {
    const { registerReconPayment } = await loadModule();
    mocks.getDocument
      .mockResolvedValueOnce({
        $id: 'item-1',
        statement_id: 'statement-1',
        status: 'pending',
        direction: 'credit',
        amount: 150,
        description: 'Pix aluno',
      })
      .mockResolvedValueOnce({
        $id: 'statement-1',
        academy_id: 'acad-1',
        bank_account: 'Conta principal',
      });

    const markMatched = vi.fn().mockResolvedValue(undefined);

    const result = await registerReconPayment({
      academyId: 'acad-1',
      me: { $id: 'user-1', name: 'Operador' },
      academyDoc: { financeConfig: '{}' },
      body: {
        item_id: 'item-1',
        lead_id: 'lead-1',
        reference_month: '2026-06',
        amount: 150,
        paid_at: '2026-06-24',
        method: 'pix',
      },
      markMatched,
    });

    expect(result.ok).toBe(true);
    expect(mocks.fetchAndValidateTxForReconciliation).toHaveBeenCalledWith(
      expect.any(Object),
      'db-test',
      'financial-tx-appwrite',
      'tx-1',
      expect.objectContaining({
        academyId: 'acad-1',
      })
    );
    expect(markMatched).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({
        item: expect.objectContaining({ $id: 'item-1' }),
      })
    );
  });
});
