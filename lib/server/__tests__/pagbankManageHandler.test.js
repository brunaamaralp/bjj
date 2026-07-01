import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  getPagbankCredentials: vi.fn(),
  reverseSettledFinanceTx: vi.fn(),
}));

vi.mock('../academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  databases: {
    listDocuments: (...args) => mocks.listDocuments(...args),
    getDocument: (...args) => mocks.getDocument(...args),
    updateDocument: (...args) => mocks.updateDocument(...args),
  },
  DB_ID: 'db-test',
}));

vi.mock('../getPagbankCredentials.js', () => ({
  getPagbankCredentials: (...args) => mocks.getPagbankCredentials(...args),
}));

vi.mock('../financeTxReverse.js', () => ({
  reverseSettledFinanceTx: (...args) => mocks.reverseSettledFinanceTx(...args),
}));

import pagbankManageHandler, {
  paymentRefundEligibilityError,
  processRefundAction,
  validateManageBody,
} from '../pagbankManageHandler.js';

const ME = { $id: 'user-1' };
const ACADEMY_ID = 'ac-1';

const PAID_PAYMENT = {
  $id: 'pay-doc-1',
  payment_id: 'PAYM_123',
  academy_id: ACADEMY_ID,
  student_id: 'student-1',
  amount: 15000,
  status: 'paid',
  financial_entry_id: 'tx-1',
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

function staffReq(body) {
  return {
    method: 'POST',
    body,
    headers: {},
  };
}

describe('validateManageBody', () => {
  it('action diferente de refund → unsupported_action', () => {
    expect(validateManageBody({ action: 'cancel', payment_id: 'PAYM_1' })).toEqual({
      error: 'unsupported_action',
    });
  });
});

describe('paymentRefundEligibilityError', () => {
  it('declined → payment_not_refundable', () => {
    expect(paymentRefundEligibilityError({ status: 'declined' })).toEqual({
      error: 'payment_not_refundable',
      current_status: 'declined',
    });
  });

  it('refunded_at preenchido → already_refunded', () => {
    expect(
      paymentRefundEligibilityError({ status: 'paid', refunded_at: '2026-01-01T00:00:00.000Z' })
    ).toEqual({ error: 'already_refunded' });
  });
});

describe('pagbankManageHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue(ME);
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: ACADEMY_ID, doc: { $id: ACADEMY_ID } });
    mocks.getPagbankCredentials.mockResolvedValue({ token: 'tok-ac' });
    mocks.reverseSettledFinanceTx.mockResolvedValue({ original: { id: 'tx-1' }, reversal: { id: 'tx-rev' } });
    mocks.getDocument.mockResolvedValue({ $id: 'tx-1', status: 'settled', academyId: ACADEMY_ID });
    mocks.updateDocument.mockResolvedValue({});

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'REFU_1', status: 'SUCCESS' }),
      })
    );
  });

  it('estorno bem-sucedido → 200 com status refunded', async () => {
    mocks.listDocuments.mockResolvedValue({ documents: [PAID_PAYMENT], total: 1 });

    const res = mockRes();
    await pagbankManageHandler(
      staffReq({ action: 'refund', payment_id: 'PAYM_123' }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, payment_id: 'PAYM_123', status: 'refunded' });
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      expect.any(String),
      'pay-doc-1',
      expect.objectContaining({ status: 'refunded', refunded_at: expect.any(String) })
    );
    expect(mocks.reverseSettledFinanceTx).toHaveBeenCalled();
  });

  it('pagamento não encontrado → 404', async () => {
    mocks.listDocuments.mockResolvedValue({ documents: [], total: 0 });

    const res = mockRes();
    await pagbankManageHandler(
      staffReq({ action: 'refund', payment_id: 'PAYM_MISSING' }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('payment_not_found');
  });

  it('pagamento já estornado → 409', async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [{ ...PAID_PAYMENT, refunded_at: '2026-02-01T00:00:00.000Z' }],
      total: 1,
    });

    const res = mockRes();
    await pagbankManageHandler(
      staffReq({ action: 'refund', payment_id: 'PAYM_123' }),
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'already_refunded' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pagamento declined → 400 payment_not_refundable', async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [{ ...PAID_PAYMENT, status: 'declined' }],
      total: 1,
    });

    const res = mockRes();
    await pagbankManageHandler(
      staffReq({ action: 'refund', payment_id: 'PAYM_123' }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('payment_not_refundable');
    expect(res.body.current_status).toBe('declined');
  });

  it('PagBank rejeita estorno (422) → 422 refund_rejected', async () => {
    mocks.listDocuments.mockResolvedValue({ documents: [PAID_PAYMENT], total: 1 });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error_messages: [{ error: 'refund_not_allowed' }] }),
      })
    );

    const res = mockRes();
    await pagbankManageHandler(
      staffReq({ action: 'refund', payment_id: 'PAYM_123' }),
      res
    );

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('refund_rejected');
    expect(res.body.detail).toBeDefined();
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  it('action diferente de refund → 400 unsupported_action', async () => {
    const res = mockRes();
    await pagbankManageHandler(
      staffReq({ action: 'suspend', payment_id: 'PAYM_123' }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('unsupported_action');
  });
});

describe('processRefundAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateDocument.mockResolvedValue({});
    mocks.getDocument.mockResolvedValue({ $id: 'tx-1', status: 'settled' });
    mocks.reverseSettledFinanceTx.mockResolvedValue({ original: {}, reversal: {} });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    );
  });

  it('não duplica estorno se já refunded_at', async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [{ ...PAID_PAYMENT, refunded_at: '2026-01-01' }],
      total: 1,
    });

    const out = await processRefundAction({
      payment_id: 'PAYM_123',
      academyId: ACADEMY_ID,
      me: ME,
      token: 'tok',
    });

    expect(out.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });
});
