import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  mirrorStudentPaymentToFinancialTx: vi.fn(),
  clearFinancialTxSyncPending: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (key, value) => ({ op: 'equal', key, value }),
    orderDesc: (key) => ({ op: 'orderDesc', key }),
    limit: (value) => ({ op: 'limit', value }),
  },
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  databases: {
    listDocuments: mocks.listDocuments,
    getDocument: mocks.getDocument,
  },
  DB_ID: 'db-test',
}));

vi.mock('../../lib/server/studentPaymentFinancialTxMirror.js', () => ({
  mirrorStudentPaymentToFinancialTx: mocks.mirrorStudentPaymentToFinancialTx,
}));

vi.mock('../../lib/server/studentPaymentSyncPending.js', () => ({
  clearFinancialTxSyncPending: mocks.clearFinancialTxSyncPending,
}));

vi.mock('../../lib/server/notifyAcademy.js', () => ({
  notifyAcademyOwner: vi.fn(),
}));

describe('reconcileStudentPaymentMirrorsForAcademy list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = 'payments-col';
    process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'tx-col';
    process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID = 'students-col';
    mocks.mirrorStudentPaymentToFinancialTx.mockResolvedValue({ mirrorId: 'tx-new', warning: null });
    mocks.getDocument.mockImplementation(async (_db, _col, id) => {
      if (String(id).startsWith('tx-plan-')) {
        return { $id: id, status: 'settled' };
      }
      throw new Error('not_found');
    });
  });

  it('consulta fee/other em query dedicada e repara taxa paga sem espelho', async () => {
    const feePayment = {
      $id: 'fee-1',
      academy_id: 'acad-1',
      lead_id: 'lead-1',
      status: 'paid',
      payment_category: 'fee',
      amount: 50,
      financial_tx_id: '',
    };

    mocks.listDocuments.mockImplementation(async (_db, col, queries) => {
      const q = JSON.stringify(queries || []);
      if (q.includes('payment_category') && q.includes('fee')) {
        return { documents: [feePayment] };
      }
      return { documents: Array.from({ length: 30 }, (_, i) => ({
        $id: `plan-${i}`,
        academy_id: 'acad-1',
        lead_id: 'lead-1',
        status: 'paid',
        payment_category: 'plan',
        amount: 200,
        financial_tx_id: `tx-plan-${i}`,
      })) };
    });

    const { reconcileStudentPaymentMirrorsForAcademy } = await import(
      '../../lib/server/studentPaymentReconcileCore.js'
    );

    const result = await reconcileStudentPaymentMirrorsForAcademy('acad-1', {}, {
      notifyOnFailure: false,
      limit: 30,
    });

    const listCalls = mocks.listDocuments.mock.calls.map((c) => JSON.stringify(c[2]));
    expect(listCalls.some((q) => q.includes('payment_category') && q.includes('fee'))).toBe(true);
    expect(result.checked).toBeGreaterThanOrEqual(31);
    expect(result.repaired).toBe(1);
    expect(mocks.mirrorStudentPaymentToFinancialTx).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentDoc: expect.objectContaining({ $id: 'fee-1' }),
      })
    );
  });
});
