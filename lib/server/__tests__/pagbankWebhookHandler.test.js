import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  getPagbankAcademyDocument: vi.fn(),
  getPagbankWebhookSecret: vi.fn(),
  mirrorStudentPaymentToFinancialTx: vi.fn(),
  upsertStudentPaymentFromPagbank: vi.fn(),
  syncOverdueAfterPagbankPaid: vi.fn(),
  loadStudentDocForPagbank: vi.fn(),
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
  getPagbankAcademyDocument: (...args) => mocks.getPagbankAcademyDocument(...args),
  getPagbankWebhookSecret: (...args) => mocks.getPagbankWebhookSecret(...args),
}));

vi.mock('../studentPaymentFinancialTxMirror.js', () => ({
  mirrorStudentPaymentToFinancialTx: (...args) => mocks.mirrorStudentPaymentToFinancialTx(...args),
}));

vi.mock('../upsertStudentPaymentFromPagbank.js', () => ({
  upsertStudentPaymentFromPagbank: (...args) => mocks.upsertStudentPaymentFromPagbank(...args),
  syncOverdueAfterPagbankPaid: (...args) => mocks.syncOverdueAfterPagbankPaid(...args),
  loadStudentDocForPagbank: (...args) => mocks.loadStudentDocForPagbank(...args),
  parseAcademyFinanceConfig: () => ({}),
}));

import pagbankWebhookHandler from '../pagbankWebhookHandler.js';

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

function declinedWebhook(overrides = {}) {
  return {
    id: overrides.eventId || 'evt-declined-1',
    event: 'subscription.recurrence',
    resource: {
      id: 'SUBS_1',
      status: 'OVERDUE',
      amount: { value: 15000 },
      updated_at: '2026-03-01T10:00:00.000-03:00',
      ...overrides.resource,
    },
    data: overrides.data,
  };
}

function paidWebhook(overrides = {}) {
  return {
    id: overrides.eventId || 'evt-paid-1',
    event: 'subscription.recurrence',
    resource: {
      id: 'SUBS_1',
      status: 'PAID',
      amount: { value: 15000 },
      paid_at: '2026-03-05T10:00:00.000-03:00',
      ...overrides.resource,
    },
  };
}

function setupListDocuments({ priorDeclined = 0, processed = false } = {}) {
  mocks.listDocuments.mockImplementation(async (_db, col, queries) => {
    const colName = String(col);
    if (colName.includes('webhook_logs') && queries?.some?.((q) => String(q).includes('processed'))) {
      return { documents: processed ? [{ $id: 'log-1' }] : [], total: processed ? 1 : 0 };
    }
    if (colName.includes('subscriptions')) {
      return { documents: [SUBSCRIPTION_DOC], total: 1 };
    }
    if (colName.includes('payments')) {
      return { documents: [], total: priorDeclined };
    }
    return { documents: [], total: 0 };
  });
}

describe('pagbankWebhookHandler — retentativas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPagbankAcademyDocument.mockResolvedValue({
      pagbank_max_retries: 3,
    });
    mocks.getPagbankWebhookSecret.mockResolvedValue(WEBHOOK_SECRET);
    mocks.createDocument.mockImplementation(async (_db, col) => {
      if (String(col).includes('webhook_logs')) return { $id: 'log-new' };
      return { $id: 'pay-new' };
    });
    mocks.updateDocument.mockResolvedValue({});
    mocks.mirrorStudentPaymentToFinancialTx.mockResolvedValue({ mirrorId: 'tx-1' });
    mocks.upsertStudentPaymentFromPagbank.mockResolvedValue({ created: true, doc: { $id: 'sp-1' } });
    mocks.syncOverdueAfterPagbankPaid.mockResolvedValue({ updated: false });
    mocks.loadStudentDocForPagbank.mockResolvedValue({ $id: 'student-1', plan: 'Mensal' });
    setupListDocuments();
  });

  function authHeaders() {
    return { authorization: `Bearer ${WEBHOOK_SECRET}` };
  }

  it('primeira cobrança negada → attempt_number 1, assinatura retrying', async () => {
    setupListDocuments({ priorDeclined: 0 });
    const res = mockRes();
    await pagbankWebhookHandler(
      { method: 'POST', headers: authHeaders(), body: declinedWebhook() },
      res
    );

    expect(res.statusCode).toBe(200);
    const paymentCreate = mocks.createDocument.mock.calls.find((c) =>
      String(c[1]).includes('payments')
    );
    expect(paymentCreate[3]).toMatchObject({
      status: 'declined',
      attempt_number: 1,
      is_final_attempt: false,
    });
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      expect.stringContaining('subscriptions'),
      'sub-doc-1',
      expect.objectContaining({ status: 'retrying', last_payment_status: 'declined' })
    );
  });

  it('terceira cobrança negada (prior 2, max 3) → is_final_attempt true, overdue', async () => {
    setupListDocuments({ priorDeclined: 2 });
    const res = mockRes();
    await pagbankWebhookHandler(
      { method: 'POST', headers: authHeaders(), body: declinedWebhook({ eventId: 'evt-d3' }) },
      res
    );

    const paymentCreate = mocks.createDocument.mock.calls.find((c) =>
      String(c[1]).includes('payments')
    );
    expect(paymentCreate[3]).toMatchObject({
      attempt_number: 3,
      is_final_attempt: true,
    });
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      expect.stringContaining('subscriptions'),
      'sub-doc-1',
      expect.objectContaining({ status: 'overdue' })
    );
  });

  it('pagbank_max_retries 5 → tentativa 3 ainda retrying', async () => {
    mocks.getPagbankAcademyDocument.mockResolvedValue({
      pagbank_max_retries: 5,
    });
    mocks.getPagbankWebhookSecret.mockResolvedValue(WEBHOOK_SECRET);
    setupListDocuments({ priorDeclined: 2 });
    const res = mockRes();
    await pagbankWebhookHandler(
      { method: 'POST', headers: authHeaders(), body: declinedWebhook({ eventId: 'evt-d3b' }) },
      res
    );

    const paymentCreate = mocks.createDocument.mock.calls.find((c) =>
      String(c[1]).includes('payments')
    );
    expect(paymentCreate[3]).toMatchObject({
      attempt_number: 3,
      is_final_attempt: false,
    });
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      expect.stringContaining('subscriptions'),
      'sub-doc-1',
      expect.objectContaining({ status: 'retrying' })
    );
  });

  it('PENDING_ACTION na fatura → is_final_attempt na primeira tentativa', async () => {
    setupListDocuments({ priorDeclined: 0 });
    const res = mockRes();
    await pagbankWebhookHandler(
      {
        method: 'POST',
        headers: authHeaders(),
        body: declinedWebhook({
          eventId: 'evt-pa',
          data: { invoice: { id: 'INVO_PA', status: 'PENDING_ACTION' } },
        }),
      },
      res
    );

    const paymentCreate = mocks.createDocument.mock.calls.find((c) =>
      String(c[1]).includes('payments')
    );
    expect(paymentCreate[3]).toMatchObject({
      attempt_number: 1,
      is_final_attempt: true,
      invoice_id: 'INVO_PA',
    });
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      expect.stringContaining('subscriptions'),
      'sub-doc-1',
      expect.objectContaining({ status: 'overdue' })
    );
  });

  it('pagamento confirmado após retrying → active e student_payments', async () => {
    setupListDocuments();
    const res = mockRes();
    await pagbankWebhookHandler(
      { method: 'POST', headers: authHeaders(), body: paidWebhook() },
      res
    );

    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      expect.stringContaining('subscriptions'),
      'sub-doc-1',
      expect.objectContaining({ status: 'active', last_payment_status: 'paid' })
    );

    const upsertIdx = mocks.upsertStudentPaymentFromPagbank.mock.invocationCallOrder[0];
    const mirrorIdx = mocks.mirrorStudentPaymentToFinancialTx.mock.invocationCallOrder[0];
    expect(upsertIdx).toBeLessThan(mirrorIdx);

    expect(mocks.upsertStudentPaymentFromPagbank).toHaveBeenCalledWith(
      expect.objectContaining({
        academyId: 'ac-1',
        studentId: 'student-1',
        status: 'paid',
        financialTxId: null,
      })
    );
    expect(mocks.mirrorStudentPaymentToFinancialTx).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentDoc: expect.objectContaining({ $id: 'sp-1' }),
      })
    );
    expect(mocks.syncOverdueAfterPagbankPaid).toHaveBeenCalled();
  });

  it('falha final → student_payments pending, sem sync overdue', async () => {
    setupListDocuments({ priorDeclined: 2 });
    const res = mockRes();
    await pagbankWebhookHandler(
      { method: 'POST', headers: authHeaders(), body: declinedWebhook({ eventId: 'evt-final-sp' }) },
      res
    );

    expect(mocks.upsertStudentPaymentFromPagbank).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        financialTxId: null,
      })
    );
    expect(mocks.syncOverdueAfterPagbankPaid).not.toHaveBeenCalled();
  });

  it('falha não-final → não toca student_payments', async () => {
    setupListDocuments({ priorDeclined: 0 });
    const res = mockRes();
    await pagbankWebhookHandler(
      { method: 'POST', headers: authHeaders(), body: declinedWebhook({ eventId: 'evt-retry' }) },
      res
    );

    expect(mocks.upsertStudentPaymentFromPagbank).not.toHaveBeenCalled();
    expect(mocks.syncOverdueAfterPagbankPaid).not.toHaveBeenCalled();
  });

  it('pagamento confirmado → sync overdue chamado', async () => {
    setupListDocuments();
    const res = mockRes();
    await pagbankWebhookHandler(
      { method: 'POST', headers: authHeaders(), body: paidWebhook({ eventId: 'evt-sync' }) },
      res
    );
    expect(mocks.syncOverdueAfterPagbankPaid).toHaveBeenCalledTimes(1);
  });

  it('pagbank_max_retries ausente na academia → fallback 3', async () => {
    mocks.getPagbankAcademyDocument.mockResolvedValue({});
    mocks.getPagbankWebhookSecret.mockResolvedValue(WEBHOOK_SECRET);
    setupListDocuments({ priorDeclined: 2 });
    const res = mockRes();
    await pagbankWebhookHandler(
      { method: 'POST', headers: authHeaders(), body: declinedWebhook({ eventId: 'evt-fb' }) },
      res
    );

    const paymentCreate = mocks.createDocument.mock.calls.find((c) =>
      String(c[1]).includes('payments')
    );
    expect(paymentCreate[3].is_final_attempt).toBe(true);
  });

  it('webhook duplicado → skipped, sem novo payment', async () => {
    setupListDocuments({ processed: true });
    const res = mockRes();
    await pagbankWebhookHandler(
      { method: 'POST', headers: authHeaders(), body: declinedWebhook() },
      res
    );

    expect(res.body).toEqual({ ok: true, skipped: true });
    const paymentCreates = mocks.createDocument.mock.calls.filter((c) =>
      String(c[1]).includes('payments')
    );
    expect(paymentCreates).toHaveLength(0);
  });
});
