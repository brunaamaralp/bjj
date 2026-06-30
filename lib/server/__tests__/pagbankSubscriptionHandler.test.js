import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  getPagbankCredentials: vi.fn(),
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
}));

vi.mock('../academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  databases: {
    listDocuments: (...args) => mocks.listDocuments(...args),
    createDocument: (...args) => mocks.createDocument(...args),
  },
  DB_ID: 'db-test',
}));

vi.mock('../getPagbankCredentials.js', () => ({
  getPagbankCredentials: (...args) => mocks.getPagbankCredentials(...args),
}));

vi.mock('../pagbankRequestAuth.js', () => ({
  resolvePagbankRequestAuth: vi.fn(async () => ({
    academyId: 'ac-1',
    studentContext: null,
  })),
}));

import pagbankSubscriptionHandler, {
  validateSubscriptionBody,
  buildPagbankSubscriptionPayload,
  mapPagbankStatus,
  buildSubscriptionIdempotencyKey,
} from '../pagbankSubscriptionHandler.js';

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

const validBody = {
  subscriber_id: 'CUST_ABC',
  plan_internal_key: 'GBLP_ADU_MEN_150',
  student_id: 'student-1',
  reference_id: 'NAVE_ac-1_student-1',
};

const planDoc = {
  plan_id: 'PLAN_TEST',
  internal_key: 'GBLP_ADU_MEN_150',
  amount: 15000,
  active: true,
};

describe('validateSubscriptionBody', () => {
  it('accepts valid payload', () => {
    const result = validateSubscriptionBody(validBody);
    expect(result.error).toBeUndefined();
    expect(result.plan_internal_key).toBe('GBLP_ADU_MEN_150');
  });

  it('flags missing plan_internal_key', () => {
    const result = validateSubscriptionBody({ ...validBody, plan_internal_key: '' });
    expect(result.error).toBe('missing_fields');
    expect(result.fields).toContain('plan_internal_key');
  });
});

describe('buildPagbankSubscriptionPayload', () => {
  it('uses customer.id and plan.id per API PagBank', () => {
    const validated = validateSubscriptionBody(validBody);
    const payload = buildPagbankSubscriptionPayload({
      ...validated,
      pagbank_plan_id: 'PLAN_TEST',
    });
    expect(payload.customer.id).toBe('CUST_ABC');
    expect(payload.plan.id).toBe('PLAN_TEST');
    expect(payload.subscriber).toBeUndefined();
  });

  it('includes trial and coupon when provided', () => {
    const validated = validateSubscriptionBody({ ...validBody, trial_days: 7, coupon_id: 'CPN_1' });
    const payload = buildPagbankSubscriptionPayload({
      ...validated,
      pagbank_plan_id: 'PLAN_TEST',
    });
    expect(payload.trial).toEqual({ days: 7 });
    expect(payload.coupon).toEqual({ id: 'CPN_1' });
  });
});

describe('mapPagbankStatus', () => {
  it('maps TRIAL to active', () => {
    expect(mapPagbankStatus('TRIAL')).toBe('active');
  });
});

describe('buildSubscriptionIdempotencyKey', () => {
  it('contains academyId, student_id and plan_internal_key', () => {
    const key = buildSubscriptionIdempotencyKey('ac-1', 'student-1', 'GBLP_ADU_MEN_150');
    expect(key).toBe('ac-1-student-1-GBLP_ADU_MEN_150');
  });
});

describe('pagbankSubscriptionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'ac-1', doc: {} });
    mocks.getPagbankCredentials.mockResolvedValue({ token: 'tok_test' });
    mocks.createDocument.mockResolvedValue({ $id: 'doc-1' });
  });

  it('creates subscription successfully → 201 active', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [planDoc] });

    fetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          id: 'SUBS_NEW',
          status: 'ACTIVE',
          next_invoice_at: '2026-07-01',
        }),
    });

    const res = mockRes();
    await pagbankSubscriptionHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.subscription_id).toBe('SUBS_NEW');
    expect(res.body.status).toBe('active');
    expect(mocks.createDocument).toHaveBeenCalledTimes(1);
  });

  it('returns existing active subscription → 200 existing', async () => {
    mocks.listDocuments.mockResolvedValueOnce({
      documents: [
        {
          subscription_id: 'SUBS_EXISTING',
          status: 'active',
          plan_id: 'GBLP_ADU_MEN_150',
          next_billing_date: '2026-08-01T00:00:00.000Z',
        },
      ],
    });

    const res = mockRes();
    await pagbankSubscriptionHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.existing).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('plan not found → 404', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [] });

    const res = mockRes();
    await pagbankSubscriptionHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('plan_not_found');
  });

  it('PagBank 404 → pagbank_plan_or_subscriber_not_found', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [planDoc] });

    fetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error_messages: [{ description: 'not found' }] }),
    });

    const res = mockRes();
    await pagbankSubscriptionHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('pagbank_plan_or_subscriber_not_found');
  });

  it('PagBank 422 → pagbank_validation_error', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [planDoc] });

    fetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ error_messages: [{ code: '422' }] }),
    });

    const res = mockRes();
    await pagbankSubscriptionHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('pagbank_validation_error');
  });

  it('pagbank_not_enabled → 403', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [planDoc] });
    mocks.getPagbankCredentials.mockRejectedValue(new Error('pagbank_not_enabled'));

    const res = mockRes();
    await pagbankSubscriptionHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(403);
  });

  it('TRIAL status maps to active internally', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [planDoc] });

    fetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          id: 'SUBS_TRIAL',
          status: 'TRIAL',
          next_invoice_at: '2026-07-15',
        }),
    });

    const res = mockRes();
    await pagbankSubscriptionHandler({ method: 'POST', body: validBody }, res);
    expect(res.body.status).toBe('active');
  });

  it('createDocument 409 → returns existing doc with 201', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [planDoc] })
      .mockResolvedValueOnce({
        documents: [
          {
            subscription_id: 'SUBS_RACE',
            status: 'active',
            plan_id: 'GBLP_ADU_MEN_150',
            next_billing_date: null,
          },
        ],
      });

    fetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: 'SUBS_RACE', status: 'ACTIVE' }),
    });

    const err409 = new Error('already exists');
    err409.code = 409;
    mocks.createDocument.mockRejectedValue(err409);

    const res = mockRes();
    await pagbankSubscriptionHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.subscription_id).toBe('SUBS_RACE');
  });

  it('sends x-idempotency-key with academy, student and plan', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [planDoc] });

    fetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: 'SUBS_KEY', status: 'ACTIVE' }),
    });

    const res = mockRes();
    await pagbankSubscriptionHandler({ method: 'POST', body: validBody }, res);

    const [, options] = fetch.mock.calls[0];
    expect(options.headers['x-idempotency-key']).toBe('ac-1-student-1-GBLP_ADU_MEN_150');
    const sentBody = JSON.parse(options.body);
    expect(sentBody.customer.id).toBe('CUST_ABC');
  });
});
