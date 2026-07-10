import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'financial-tx-col';
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = 'student-payments-col';
  return {
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  getDocument: vi.fn(),
  getPagbankAcademyDocument: vi.fn(),
  getPagbankWebhookSecret: vi.fn(),
  upsertStudentPaymentFromPagbank: vi.fn(),
  syncOverdueAfterPagbankPaid: vi.fn(),
  loadStudentDocForPagbank: vi.fn(),
  applyAccountingSideEffectsAutoServer: vi.fn(),
  resolveFinancialTxSettlement: vi.fn(),
  mirrorAmountsForPaymentWithAccount: vi.fn(),
};
});

vi.mock('../academyAccess.js', () => ({
  databases: {
    listDocuments: (...args) => mocks.listDocuments(...args),
    createDocument: (...args) => mocks.createDocument(...args),
    updateDocument: (...args) => mocks.updateDocument(...args),
    getDocument: (...args) => mocks.getDocument(...args),
  },
  DB_ID: 'db-test',
}));

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (key, value) => ({ op: 'equal', key, value }),
    limit: (value) => ({ op: 'limit', value }),
    orderDesc: (key) => ({ op: 'orderDesc', key }),
  },
  ID: { unique: () => 'tx-new' },
  Permission: { read: () => 'read', update: () => 'update' },
  Role: { users: () => 'users' },
}));

vi.mock('../getPagbankCredentials.js', () => ({
  getPagbankAcademyDocument: (...args) => mocks.getPagbankAcademyDocument(...args),
  getPagbankWebhookSecret: (...args) => mocks.getPagbankWebhookSecret(...args),
}));

vi.mock('../financeTxFields.js', () => ({
  financeTxDocumentWithOptionals: (payload) => payload,
  stripUnknownFinanceTxAttrs: (payload) => payload,
  financeTxOptionalPatchForAppwrite: (payload) => payload,
}));

vi.mock('../appwriteSchemaResilient.js', () => ({
  updateDocumentResilient: (...args) => mocks.updateDocument(...args),
}));

vi.mock('../financeJournalServer.js', () => ({
  applyAccountingSideEffectsAutoServer: mocks.applyAccountingSideEffectsAutoServer,
}));

vi.mock('../../src/lib/paymentSettlement.js', () => ({
  resolveFinancialTxSettlement: mocks.resolveFinancialTxSettlement,
}));

vi.mock('../../src/lib/paymentStatus.js', () => ({
  mirrorGrossForPayment: (_status, paidAmount, expectedAmount) =>
    Number(paidAmount) || Number(expectedAmount) || 0,
  shouldMirrorPaymentToCaixa: (status) => {
    const s = String(status).toLowerCase();
    return ['paid', 'partial', 'pending', 'awaiting'].includes(s);
  },
  expectedAmountForStudent: (_studentDoc, _financeConfig, payment) =>
    Number(payment?.expected_amount) || Number(payment?.amount) || 0,
}));

vi.mock('../../src/lib/financeReconTxLabel.js', () => ({
  buildMirrorPlanName: () => 'Pagamento',
}));

vi.mock('../../src/lib/financeCategories.js', () => ({
  FINANCE_CATEGORIES: {
    OUTRAS_DESPESAS: { type: 'expense', label: 'Outras despesas' },
  },
}));

vi.mock('../../src/lib/captureMethods.js', () => ({
  resolveBankAccountForCaptureMethod: () => '',
}));

vi.mock('../../src/lib/studentPaymentMirrorCategory.js', () => ({
  resolveMirrorFinanceCategory: () => ({ type: 'plan', label: 'Mensalidades' }),
  isReconcilableMirrorPayment: () => true,
}));

vi.mock('../studentPaymentMirrorCancel.js', () => ({
  cancelFinancialTxMirrorsForPayment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../upsertStudentPaymentFromPagbank.js', () => ({
  upsertStudentPaymentFromPagbank: (...args) => mocks.upsertStudentPaymentFromPagbank(...args),
  syncOverdueAfterPagbankPaid: (...args) => mocks.syncOverdueAfterPagbankPaid(...args),
  loadStudentDocForPagbank: (...args) => mocks.loadStudentDocForPagbank(...args),
  parseAcademyFinanceConfig: () => ({}),
}));

vi.mock('../../src/lib/resolveAcquirerFees.js', () => ({
  mirrorAmountsForPaymentWithAccount: mocks.mirrorAmountsForPaymentWithAccount,
}));

vi.mock('../../src/lib/financeConfigStorage.js', () => ({
  mergeFinanceConfigFromAcademyDoc: () => ({}),
}));

vi.mock('../notifyAcademy.js', () => ({
  notifyAcademyOwner: vi.fn(),
}));

vi.mock('../studentPaymentSyncPending.js', () => ({
  clearFinancialTxSyncPending: vi.fn().mockResolvedValue(undefined),
}));

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

const WEBHOOK_SECRET = 'whsec_test';
const SUBSCRIPTION_DOC = {
  $id: 'sub-doc-1',
  subscription_id: 'SUBS_1',
  academy_id: 'ac-1',
  student_id: 'student-1',
  status: 'active',
};

function paidWebhook() {
  return {
    id: 'evt-paid-origin',
    event: 'subscription.recurrence',
    resource: {
      id: 'SUBS_1',
      status: 'PAID',
      amount: { value: 15000 },
      paid_at: '2026-03-05T10:00:00.000-03:00',
    },
  };
}

describe('PagBank mirror origin_id', () => {
  let pagbankWebhookHandler;
  let mirrorStudentPaymentToFinancialTx;
  let reconcileStudentPaymentMirrorsForAcademy;

  beforeAll(async () => {
    process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'financial-tx-col';
    process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID = 'student-payments-col';
    vi.resetModules();
    ({ default: pagbankWebhookHandler } = await import('../pagbankWebhookHandler.js'));
    ({ mirrorStudentPaymentToFinancialTx } = await import('../studentPaymentFinancialTxMirror.js'));
    ({ reconcileStudentPaymentMirrorsForAcademy } = await import('../studentPaymentReconcileCore.js'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDocument.mockImplementation(async (_db, col) => {
      if (String(col).includes('webhook_logs')) return { $id: 'log-new' };
      if (String(col).includes('pagbank')) return { $id: 'pb-pay-1' };
      if (String(col) === 'financial-tx-col') return { $id: 'tx-created' };
      return { $id: 'doc-new' };
    });
    mocks.updateDocument.mockImplementation(async (_db, _col, id) => ({ $id: id }));
    mocks.getDocument.mockRejectedValue(new Error('not_found'));

    mocks.getPagbankAcademyDocument.mockResolvedValue({});
    mocks.getPagbankWebhookSecret.mockResolvedValue(WEBHOOK_SECRET);
    mocks.syncOverdueAfterPagbankPaid.mockResolvedValue({ updated: false });
    mocks.loadStudentDocForPagbank.mockResolvedValue({ $id: 'student-1', plan: 'Mensal' });
    mocks.upsertStudentPaymentFromPagbank.mockResolvedValue({
      skipped: false,
      doc: { $id: 'sp-grid-1', financial_tx_id: '' },
    });
    mocks.resolveFinancialTxSettlement.mockReturnValue({
      status: 'settled',
      settledAt: '2026-03-05T10:00:00.000Z',
      expected_settlement_at: null,
    });
    mocks.mirrorAmountsForPaymentWithAccount.mockReturnValue({ fee: 0, net: 150 });

    mocks.listDocuments.mockImplementation(async (_db, col, queries) => {
      const colName = String(col);
      if (colName.includes('webhook_logs')) return { documents: [], total: 0 };
      if (colName.includes('subscriptions')) return { documents: [SUBSCRIPTION_DOC], total: 1 };
      if (colName === 'student-payments-col') {
        const leadQ = queries?.find?.((q) => q.key === 'lead_id');
        if (leadQ) {
          return {
            documents: [
              {
                $id: 'sp-grid-1',
                lead_id: 'student-1',
                academy_id: 'ac-1',
                reference_month: '2026-03',
                payment_category: 'plan',
                status: 'paid',
              },
            ],
          };
        }
      }
      if (colName === 'financial-tx-col') {
        const originId = queries?.find?.((q) => q.key === 'origin_id')?.value;
        if (originId === 'sp-grid-1') {
          return {
            documents: [
              {
                $id: 'tx-existing',
                origin_type: 'student_payment',
                origin_id: 'sp-grid-1',
                status: 'settled',
              },
            ],
          };
        }
        return { documents: [] };
      }
      return { documents: [], total: 0 };
    });
  });

  it('webhook paid: upsert antes do espelho e origin_id = student_payments.$id', async () => {
    const opOrder = [];
    mocks.upsertStudentPaymentFromPagbank.mockImplementation(async () => {
      opOrder.push('upsert');
      return { skipped: false, doc: { $id: 'sp-grid-1', financial_tx_id: '' } };
    });
    mocks.listDocuments.mockImplementation(async (_db, col) => {
      const colName = String(col);
      if (colName.includes('webhook_logs')) return { documents: [], total: 0 };
      if (colName.includes('subscriptions')) return { documents: [SUBSCRIPTION_DOC], total: 1 };
      if (colName === 'financial-tx-col') return { documents: [] };
      return { documents: [], total: 0 };
    });
    const originalCreate = mocks.createDocument.getMockImplementation();
    mocks.createDocument.mockImplementation(async (...args) => {
      if (String(args[1]) === 'financial-tx-col') opOrder.push('mirror');
      return originalCreate(...args);
    });
    mocks.updateDocument.mockImplementation(async (_db, col) => {
      if (String(col) === 'financial-tx-col') opOrder.push('mirror');
      return {};
    });

    const res = mockRes();
    await pagbankWebhookHandler(
      { method: 'POST', headers: { authorization: `Bearer ${WEBHOOK_SECRET}` }, body: paidWebhook() },
      res
    );

    expect(res.body).toEqual({ ok: true });
    expect(opOrder[0]).toBe('upsert');
    expect(opOrder).toContain('mirror');

    const mirrorCreate = mocks.createDocument.mock.calls.find((c) => c[1] === 'financial-tx-col');
    const mirrorUpdate = mocks.updateDocument.mock.calls.find((c) => c[1] === 'financial-tx-col');
    const mirrorPayload = mirrorCreate?.[3] || mirrorUpdate?.[3];
    expect(mirrorPayload).toMatchObject({
      origin_type: 'student_payment',
      origin_id: 'sp-grid-1',
    });
  });

  it('attachFinancialTxId resolve student_payments por lead+mês quando $id é ID PagBank externo', async () => {
    mocks.getDocument.mockRejectedValue(new Error('document_not_found'));
    mocks.listDocuments.mockImplementation(async (_db, col, queries) => {
      if (String(col) === 'financial-tx-col') return { documents: [] };
      if (String(col) === 'student-payments-col') {
        return {
          documents: [
            {
              $id: 'sp-resolved',
              lead_id: 'student-1',
              academy_id: 'ac-1',
              reference_month: '2026-03',
              payment_category: 'plan',
            },
          ],
        };
      }
      return { documents: [] };
    });

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: {
        $id: 'PAYM_EXTERNAL_99',
        lead_id: 'student-1',
        academy_id: 'ac-1',
        amount: 150,
        paid_amount: 150,
        status: 'paid',
        reference_month: '2026-03',
        method: 'cartao_credito',
        payment_category: 'plan',
      },
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Aluno', plan: 'Mensal' },
    });

    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      'student-payments-col',
      'sp-resolved',
      { financial_tx_id: 'tx-created' }
    );
  });

  it('reconcileStudentPaymentMirrors encontra espelho PagBank por origin_id correto', async () => {
    mocks.listDocuments.mockImplementation(async (_db, col, queries) => {
      if (String(col) === 'student-payments-col') {
        const hasAcademy = queries?.some?.((q) => q.key === 'academy_id');
        if (hasAcademy) {
          return {
            documents: [
              {
                $id: 'sp-grid-1',
                lead_id: 'student-1',
                academy_id: 'ac-1',
                reference_month: '2026-03',
                payment_category: 'plan',
                status: 'paid',
                financial_tx_id: '',
                amount: 150,
              },
            ],
          };
        }
        return {
          documents: [
            {
              $id: 'sp-grid-1',
              lead_id: 'student-1',
              academy_id: 'ac-1',
              reference_month: '2026-03',
              payment_category: 'plan',
            },
          ],
        };
      }
      if (String(col) === 'financial-tx-col') {
        const originId = queries?.find?.((q) => q.key === 'origin_id')?.value;
        if (originId === 'sp-grid-1') {
          return {
            documents: [
              {
                $id: 'tx-existing',
                origin_type: 'student_payment',
                origin_id: 'sp-grid-1',
                status: 'settled',
              },
            ],
          };
        }
      }
      return { documents: [] };
    });

    const result = await reconcileStudentPaymentMirrorsForAcademy('ac-1', {}, { notifyOnFailure: false });
    expect(result.checked).toBe(1);
    expect(result.repaired).toBe(1);
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-col',
      'tx-existing',
      expect.objectContaining({ origin_id: 'sp-grid-1' })
    );
  });

  it('regressão manual: origin_id permanece o $id do paymentDoc', async () => {
    mocks.listDocuments.mockResolvedValue({ documents: [] });
    mocks.getDocument.mockImplementation(async (_db, col, id) => {
      if (String(col) === 'student-payments-col') return { $id: id };
      throw new Error('not_found');
    });

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: {
        $id: 'pay-manual-42',
        lead_id: 'lead-1',
        academy_id: 'ac-1',
        amount: 200,
        paid_amount: 200,
        status: 'paid',
        reference_month: '2026-04',
        method: 'pix',
        payment_category: 'plan',
      },
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao' },
    });

    const mirrorCreate = mocks.createDocument.mock.calls.find((c) => c[1] === 'financial-tx-col');
    expect(mirrorCreate?.[3]?.origin_id).toBe('pay-manual-42');
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      'student-payments-col',
      'pay-manual-42',
      { financial_tx_id: 'tx-created' }
    );
  });
});
