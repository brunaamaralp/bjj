import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  getPagbankCredentials: vi.fn(),
  mirrorStudentPaymentToFinancialTx: vi.fn(),
  fetchPagbankJson: vi.fn(),
}));

vi.mock('../academyAccess.js', () => ({
  databases: {
    listDocuments: (...args) => mocks.listDocuments(...args),
    createDocument: (...args) => mocks.createDocument(...args),
    updateDocument: (...args) => mocks.updateDocument(...args),
  },
  DB_ID: 'db-test',
}));

vi.mock('../getPagbankCredentials.js', () => ({
  getPagbankCredentials: (...args) => mocks.getPagbankCredentials(...args),
  getPagbankAcademyDocument: vi.fn().mockResolvedValue({ pagbank_enabled: true }),
}));

vi.mock('../upsertStudentPaymentFromPagbank.js', () => ({
  upsertStudentPaymentFromPagbank: vi.fn().mockResolvedValue({ created: true, doc: { $id: 'sp-reconcile-1' } }),
  syncOverdueAfterPagbankPaid: vi.fn().mockResolvedValue({}),
  loadStudentDocForPagbank: vi.fn().mockResolvedValue({ $id: 'student-1' }),
  parseAcademyFinanceConfig: () => ({}),
}));

vi.mock('../studentPaymentFinancialTxMirror.js', () => ({
  mirrorStudentPaymentToFinancialTx: (...args) => mocks.mirrorStudentPaymentToFinancialTx(...args),
}));

import pagbankReconcileHandler, {
  isPagbankPaymentApproved,
  reconcileSubscription,
  runPagbankReconcileCron,
  validatePagbankReconcileCronAuth,
} from '../pagbankReconcileHandler.js';

const SUB_DOC = {
  $id: 'sub-doc-1',
  subscription_id: 'SUBS_1',
  student_id: 'student-1',
  academy_id: 'ac-1',
  status: 'retrying',
};

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
  res.setHeader = () => res;
  return res;
}

describe('pagbankReconcileHandler auth', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test-secret';
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it('auth inválida → 401', async () => {
    const res = mockRes();
    await pagbankReconcileHandler(
      { method: 'GET', headers: { authorization: 'Bearer wrong' } },
      res
    );
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('validatePagbankReconcileCronAuth aceita Bearer CRON_SECRET', () => {
    expect(
      validatePagbankReconcileCronAuth({
        headers: { authorization: 'Bearer cron-test-secret' },
      })
    ).toBe(true);
  });
});

describe('isPagbankPaymentApproved', () => {
  it('aceita APPROVED e PAID', () => {
    expect(isPagbankPaymentApproved('APPROVED')).toBe(true);
    expect(isPagbankPaymentApproved('PAID')).toBe(true);
    expect(isPagbankPaymentApproved('DENIED')).toBe(false);
  });
});

describe('runPagbankReconcileCron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-test-secret';
    mocks.getPagbankCredentials.mockResolvedValue({ token: 'tok-ac' });
    mocks.mirrorStudentPaymentToFinancialTx.mockResolvedValue({ mirrorId: 'tx-1' });
    mocks.createDocument.mockResolvedValue({ $id: 'pay-doc-1' });
    mocks.updateDocument.mockResolvedValue({});

    mocks.listDocuments.mockImplementation(async (_db, col, queries) => {
      const colName = String(col);
      if (colName.includes('subscriptions') && queries?.some?.((q) => String(q).includes('status'))) {
        return { documents: [SUB_DOC], total: 1 };
      }
      if (colName.includes('payments')) {
        return { documents: [], total: 0 };
      }
      return { documents: [], total: 0 };
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('/invoices/') && String(url).includes('/payments')) {
          return {
            ok: true,
            json: async () => ({
              payments: [
                {
                  id: 'PAYM_NEW',
                  status: 'APPROVED',
                  amount: { value: 15000 },
                  updated_at: '2026-03-05T10:00:00.000-03:00',
                },
              ],
            }),
          };
        }
        if (String(url).includes('/subscriptions/') && String(url).includes('/invoices')) {
          return {
            ok: true,
            json: async () => ({
              invoices: [{ id: 'INVO_1', status: 'PAID' }],
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      })
    );
  });

  it('pagamento ausente no Appwrite → cria documento + financial_entry', async () => {
    const out = await runPagbankReconcileCron();
    expect(out.checked).toBe(1);
    expect(out.created).toBe(1);
    expect(mocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      expect.stringContaining('payments'),
      expect.any(String),
      expect.objectContaining({
        payment_id: 'PAYM_NEW',
        status: 'paid',
        webhook_event_id: 'reconcile-PAYM_NEW',
      })
    );
    expect(mocks.mirrorStudentPaymentToFinancialTx).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentDoc: expect.objectContaining({ $id: 'sp-reconcile-1' }),
      })
    );
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      expect.stringContaining('payments'),
      'pay-doc-1',
      expect.objectContaining({ financial_entry_id: 'tx-1', student_payment_id: 'sp-reconcile-1' })
    );
  });

  it('pagamento já existe → não duplica', async () => {
    mocks.listDocuments.mockImplementation(async (_db, col) => {
      const colName = String(col);
      if (colName.includes('subscriptions')) {
        return { documents: [SUB_DOC], total: 1 };
      }
      if (colName.includes('payments')) {
        return { documents: [{ $id: 'existing', payment_id: 'PAYM_NEW' }], total: 1 };
      }
      return { documents: [], total: 0 };
    });

    const out = await runPagbankReconcileCron();
    expect(out.checked).toBe(1);
    expect(out.created).toBe(0);
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it('academia sem credenciais → erro e continua', async () => {
    mocks.getPagbankCredentials.mockRejectedValue(new Error('pagbank_not_enabled'));
    const out = await runPagbankReconcileCron();
    expect(out.errors).toBe(1);
    expect(out.details).toContainEqual({ academyId: 'ac-1', error: 'credentials_unavailable' });
    expect(out.checked).toBe(0);
  });

  it('sem pagamentos novos → checked incrementa, created 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('/invoices')) {
          return { ok: true, json: async () => ({ invoices: [] }) };
        }
        return { ok: false, json: async () => ({}) };
      })
    );

    const out = await runPagbankReconcileCron();
    expect(out.checked).toBe(1);
    expect(out.created).toBe(0);
  });
});

describe('reconcileSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mirrorStudentPaymentToFinancialTx.mockResolvedValue({ mirrorId: 'tx-2' });
    mocks.createDocument.mockResolvedValue({ $id: 'pay-doc-2' });
    mocks.updateDocument.mockResolvedValue({});
    mocks.listDocuments.mockResolvedValue({ documents: [], total: 0 });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('/invoices/INVO_2/payments')) {
          return {
            ok: true,
            json: async () => ({
              payments: [{ id: 'PAYM_UNIT', status: 'APPROVED', amount: { value: 1000 }, updated_at: '2026-02-01T12:00:00-03:00' }],
            }),
          };
        }
        if (String(url).includes('/subscriptions/SUBS_1/invoices')) {
          return { ok: true, json: async () => ({ invoices: [{ id: 'INVO_2' }] }) };
        }
        return { ok: false, json: async () => ({}) };
      })
    );
  });

  it('unit: cria pagamento reconciliado', async () => {
    const results = { checked: 0, created: 0, errors: 0, details: [] };
    await reconcileSubscription(SUB_DOC, 'tok', 'ac-1', results);
    expect(results.created).toBe(1);
    expect(results.details[0].action).toBe('created_via_reconcile');
  });
});
