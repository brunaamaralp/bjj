import { beforeEach, describe, expect, it, vi } from 'vitest';

const serverMocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  applyAccountingSideEffectsAutoServer: vi.fn(),
  resolveFinancialTxSettlement: vi.fn(),
  mirrorAmountsForPaymentWithAccount: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (key, value) => ({ op: 'equal', key, value }),
    limit: (value) => ({ op: 'limit', value }),
  },
  ID: { unique: () => 'tx-new' },
  Permission: {
    read: () => 'read',
    update: () => 'update',
  },
  Role: {
    users: () => 'users',
  },
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  DB_ID: 'db-test',
  databases: {
    createDocument: serverMocks.createDocument,
    updateDocument: serverMocks.updateDocument,
    listDocuments: serverMocks.listDocuments,
    getDocument: serverMocks.getDocument,
  },
}));

vi.mock('../../lib/server/financeTxFields.js', () => ({
  financeTxDocumentWithOptionals: (payload) => payload,
  stripUnknownFinanceTxAttrs: (payload) => payload,
}));

vi.mock('../../lib/server/financeJournalServer.js', () => ({
  applyAccountingSideEffectsAutoServer: serverMocks.applyAccountingSideEffectsAutoServer,
}));

vi.mock('../../src/lib/financeCategories.js', () => ({
  FINANCE_CATEGORIES: {
    MENSALIDADE: { type: 'plan', label: 'Mensalidades' },
    OUTROS_RECEITA: { type: 'other', label: 'Outras receitas' },
    OUTRAS_DESPESAS: { type: 'expense', label: 'Outras despesas' },
  },
}));

vi.mock('../../src/lib/paymentStatus.js', () => ({
  mirrorGrossForPayment: (status, paidAmount, expectedAmount) => {
    const s = String(status).toLowerCase();
    if (s === 'partial') return Number(paidAmount) || 0;
    if (s === 'pending' || s === 'awaiting') return Number(expectedAmount) || Number(paidAmount) || 0;
    return Number(paidAmount) || Number(expectedAmount) || 0;
  },
  shouldMirrorPaymentToCaixa: (status) => {
    const s = String(status).toLowerCase();
    if (s === 'covered' || s === 'frozen' || s === 'cancelled') return false;
    return ['paid', 'partial', 'pending', 'awaiting'].includes(s);
  },
  expectedAmountForStudent: (_studentDoc, _financeConfig, payment) => Number(payment?.expected_amount) || 0,
}));

vi.mock('../../src/lib/financeReconTxLabel.js', () => ({
  buildMirrorPlanName: ({ studentName, planName, refMonth }) =>
    [studentName, planName, refMonth].filter(Boolean).join(' | ') || 'Pagamento',
}));

vi.mock('../../src/lib/resolveAcquirerFees.js', () => ({
  mirrorAmountsForPaymentWithAccount: serverMocks.mirrorAmountsForPaymentWithAccount,
}));

vi.mock('../../src/lib/paymentSettlement.js', () => ({
  resolveFinancialTxSettlement: serverMocks.resolveFinancialTxSettlement,
}));

async function loadMirrorModule(options = {}) {
  const {
    appwriteFinancialTxCollectionId,
    legacyFinancialTxCollectionId,
  } = options;
  const viteFinancialTxCollectionId = Object.prototype.hasOwnProperty.call(
    options,
    'viteFinancialTxCollectionId'
  )
    ? options.viteFinancialTxCollectionId
    : 'financial-tx-col';
  const paymentsCollectionId = Object.prototype.hasOwnProperty.call(options, 'paymentsCollectionId')
    ? options.paymentsCollectionId
    : 'student-payments-col';

  vi.resetModules();
  if (appwriteFinancialTxCollectionId === undefined) delete process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID;
  else process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID = appwriteFinancialTxCollectionId;

  if (viteFinancialTxCollectionId === undefined) delete process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID;
  else process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = viteFinancialTxCollectionId;

  if (legacyFinancialTxCollectionId === undefined) delete process.env.FINANCIAL_TX_COL;
  else process.env.FINANCIAL_TX_COL = legacyFinancialTxCollectionId;

  if (paymentsCollectionId === undefined) delete process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID;
  else process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = paymentsCollectionId;

  return import('../../lib/server/studentPaymentFinancialTxMirror.js');
}

function buildPaymentDoc(overrides = {}) {
  return {
    $id: 'pay-1',
    lead_id: 'lead-1',
    academy_id: 'acad-1',
    status: 'paid',
    expected_amount: 120,
    paid_amount: 120,
    amount: 120,
    method: 'pix',
    installments: 1,
    reference_month: '2026-07',
    plan_name: 'Adulto',
    paid_at: '2026-07-05T12:00:00.000Z',
    registered_by: 'user-1',
    ...overrides,
  };
}

describe('studentPaymentFinancialTxMirror', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverMocks.createDocument.mockResolvedValue({ $id: 'tx-created' });
    serverMocks.updateDocument.mockResolvedValue({ $id: 'tx-created' });
    serverMocks.listDocuments.mockResolvedValue({ documents: [] });
    serverMocks.getDocument.mockImplementation(async (_db, _col, id) => ({
      $id: id,
      status: 'settled',
    }));
    serverMocks.mirrorAmountsForPaymentWithAccount.mockReturnValue({ fee: 4.5, net: 115.5 });
    serverMocks.resolveFinancialTxSettlement.mockImplementation(({ dueDate, paidAt }) => ({
      status: 'pending',
      settledAt: null,
      expected_settlement_at: dueDate ? `${String(dueDate).slice(0, 10)}T23:59:59.999Z` : paidAt || null,
    }));
  });

  it('encaminha due_date para resolver expected_settlement_at do espelho', async () => {
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule();

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        method: 'boleto',
        due_date: '2026-07-10',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(serverMocks.resolveFinancialTxSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: '2026-07-10',
      })
    );
    expect(serverMocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-col',
      'tx-new',
      expect.objectContaining({
        expected_settlement_at: '2026-07-10T23:59:59.999Z',
      }),
      ['read', 'update']
    );
  });

  it('propaga gateway_charge_id e gateway_provider do payment de origem PagBank', async () => {
    serverMocks.resolveFinancialTxSettlement.mockReturnValue({
      status: 'settled',
      settledAt: '2026-07-05T12:00:00.000Z',
      expected_settlement_at: null,
    });
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule();

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        gateway_payment_id: 'PAY_GW_123',
        gateway_provider: 'pagbank',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(serverMocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-col',
      'tx-new',
      expect.objectContaining({
        gateway_charge_id: 'PAY_GW_123',
        gateway_provider: 'pagbank',
      }),
      ['read', 'update']
    );
  });

  it('prioriza APPWRITE_FINANCIAL_TX_COLLECTION_ID sobre VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID e FINANCIAL_TX_COL', async () => {
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule({
      appwriteFinancialTxCollectionId: 'financial-tx-appwrite',
      viteFinancialTxCollectionId: 'financial-tx-vite',
      legacyFinancialTxCollectionId: 'financial-tx-legacy',
    });

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        $id: 'pay-appwrite-precedence',
        financial_tx_id: '',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(serverMocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-appwrite',
      'tx-new',
      expect.objectContaining({
        origin_id: 'pay-appwrite-precedence',
        origin_type: 'student_payment',
      }),
      ['read', 'update']
    );
  });

  it('usa FINANCIAL_TX_COL como fallback quando APPWRITE e VITE nao existem', async () => {
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule({
      appwriteFinancialTxCollectionId: undefined,
      viteFinancialTxCollectionId: undefined,
      legacyFinancialTxCollectionId: 'financial-tx-legacy',
    });

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        $id: 'pay-legacy-fallback',
        financial_tx_id: '',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(serverMocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-legacy',
      'tx-new',
      expect.objectContaining({
        origin_id: 'pay-legacy-fallback',
        origin_type: 'student_payment',
      }),
      ['read', 'update']
    );
  });

  it('avisa de forma estruturada e retorna sem quebrar quando nenhuma env de financial_tx existe', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule({
      appwriteFinancialTxCollectionId: undefined,
      viteFinancialTxCollectionId: undefined,
      legacyFinancialTxCollectionId: undefined,
    });

    const result = await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        $id: 'pay-missing-env',
        financial_tx_id: '',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(result).toEqual({ mirrorId: null });
    expect(serverMocks.createDocument).not.toHaveBeenCalled();
    expect(serverMocks.updateDocument).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[studentPaymentFinancialTxMirror] missing financial_tx collection env',
      {
        paymentId: 'pay-missing-env',
        tried: [
          'APPWRITE_FINANCIAL_TX_COLLECTION_ID',
          'VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID',
          'FINANCIAL_TX_COL',
        ],
      }
    );
  });

  it('usa a conta do meio de captura como bank_account quando nao ha conta explicita', async () => {
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule();

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        $id: 'pay-2',
        lead_id: 'lead-2',
        status: 'paid',
        expected_amount: 150,
        paid_amount: 150,
        amount: 150,
        method: 'cartao_credito',
        installments: 3,
        reference_month: '2026-08',
        plan_name: 'Kids',
        paid_at: '2026-08-15T10:00:00.000Z',
        capture_method_id: 'cap-1',
        registered_by: 'user-2',
      }),
      payload: {},
      financeConfig: {
        bankAccounts: [{ bankName: 'PagBank', account: '1234' }],
        captureMethods: [
          {
            id: 'cap-1',
            name: 'Link PagBank',
            paymentMethod: 'cartao_credito',
            bankAccountLabel: 'PagBank · 1234',
            active: true,
            useDefaultFees: true,
          },
        ],
      },
      studentDoc: { name: 'Maria', plan: 'Kids' },
    });

    expect(serverMocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-col',
      'tx-new',
      expect.objectContaining({
        bank_account: 'PagBank · 1234',
        capture_method_id: 'cap-1',
      }),
      ['read', 'update']
    );
    expect(serverMocks.mirrorAmountsForPaymentWithAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        bankAccount: 'PagBank · 1234',
        captureMethodId: 'cap-1',
      })
    );
  });

  it('pending atualiza financial_tx existente com status pending', async () => {
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule();
    serverMocks.updateDocument.mockResolvedValue({ $id: 'tx-main-existing' });
    serverMocks.listDocuments.mockImplementation(async (_db, _col, queries) => {
      const originType = queries.find((q) => q.key === 'origin_type')?.value;
      if (originType === 'student_payment') {
        return { documents: [{ $id: 'tx-main-existing', origin_type: 'student_payment', origin_id: 'pay-pending' }] };
      }
      if (originType === 'student_payment_troco') {
        return { documents: [] };
      }
      return { documents: [] };
    });

    const result = await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        $id: 'pay-pending',
        status: 'pending',
        expected_amount: 120,
        paid_amount: 0,
        amount: 120,
        due_date: '2026-08-10',
        financial_tx_id: '',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(result.mirrorId).toBe('tx-main-existing');
    expect(serverMocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-col',
      'tx-main-existing',
      expect.objectContaining({
        status: 'pending',
        settledAt: null,
        expected_settlement_at: '2026-08-10T23:59:59.999Z',
      })
    );
    expect(serverMocks.createDocument).not.toHaveBeenCalled();
  });

  it('cancelled cancela o main financial_tx encontrado por origin de forma deterministica', async () => {
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule();
    serverMocks.listDocuments.mockImplementation(async (_db, _col, queries) => {
      const originType = queries.find((q) => q.key === 'origin_type')?.value;
      if (originType === 'student_payment') {
        return {
          documents: [
            { $id: 'tx-z', origin_type: 'student_payment', origin_id: 'pay-cancelled', status: 'cancelled' },
            { $id: 'tx-a', origin_type: 'student_payment', origin_id: 'pay-cancelled', status: 'settled' },
          ],
        };
      }
      if (originType === 'student_payment_troco') {
        return { documents: [] };
      }
      return { documents: [] };
    });
    serverMocks.getDocument.mockImplementation(async (_db, _col, id) => ({
      $id: id,
      status: id === 'tx-z' ? 'cancelled' : 'settled',
    }));

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        $id: 'pay-cancelled',
        status: 'cancelled',
        financial_tx_id: '',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(serverMocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-col',
      'tx-a',
      { status: 'cancelled', settledAt: '' }
    );
    expect(serverMocks.createDocument).not.toHaveBeenCalled();
  });

  it('partial cria espelho quando ainda nao existe main financial_tx', async () => {
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule();

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        $id: 'pay-partial',
        status: 'partial',
        paid_amount: 55,
        amount: 120,
        financial_tx_id: '',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(serverMocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-col',
      'tx-new',
      expect.objectContaining({
        origin_type: 'student_payment',
        origin_id: 'pay-partial',
        gross: 55,
      }),
      ['read', 'update']
    );
  });

  it('paid faz retry sem duplicar ao atualizar o main financial_tx encontrado por origin', async () => {
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule();
    serverMocks.listDocuments.mockImplementation(async (_db, _col, queries) => {
      const originType = queries.find((q) => q.key === 'origin_type')?.value;
      if (originType === 'student_payment') {
        return { documents: [{ $id: 'tx-retry', origin_type: 'student_payment', origin_id: 'pay-retry' }] };
      }
      return { documents: [] };
    });

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        $id: 'pay-retry',
        status: 'paid',
        financial_tx_id: '',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(serverMocks.createDocument).not.toHaveBeenCalled();
    expect(serverMocks.updateDocument).toHaveBeenNthCalledWith(
      1,
      'db-test',
      'financial-tx-col',
      'tx-retry',
      expect.objectContaining({
        origin_type: 'student_payment',
        origin_id: 'pay-retry',
        gross: 120,
      })
    );
    expect(serverMocks.updateDocument).toHaveBeenNthCalledWith(
      2,
      'db-test',
      'student-payments-col',
      'pay-retry',
      { financial_tx_id: 'tx-created' }
    );
  });

  it('paid cria main financial_tx quando lookup por origin nao encontra existente', async () => {
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule();

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        $id: 'pay-paid-create',
        status: 'paid',
        financial_tx_id: '',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(serverMocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-col',
      'tx-new',
      expect.objectContaining({
        origin_type: 'student_payment',
        origin_id: 'pay-paid-create',
        gross: 120,
      }),
      ['read', 'update']
    );
  });

  it('fee espelha como Outras receitas', async () => {
    const { mirrorStudentPaymentToFinancialTx } = await loadMirrorModule();

    await mirrorStudentPaymentToFinancialTx({
      paymentDoc: buildPaymentDoc({
        payment_category: 'fee',
        reference_month: null,
        note: 'Taxa competição',
      }),
      payload: {},
      financeConfig: {},
      studentDoc: { name: 'Joao', plan: 'Adulto' },
    });

    expect(serverMocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      'financial-tx-col',
      'tx-new',
      expect.objectContaining({
        type: 'other',
        category: 'Outras receitas',
      }),
      ['read', 'update']
    );
  });
});
