import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  isAcademyOwnerOrAdminUser: vi.fn(),
  invalidateAcademyAccessCache: vi.fn(),
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock('../academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  isAcademyOwnerOrAdminUser: (...args) => mocks.isAcademyOwnerOrAdminUser(...args),
  invalidateAcademyAccessCache: (...args) => mocks.invalidateAcademyAccessCache(...args),
  databases: {
    listDocuments: (...args) => mocks.listDocuments(...args),
    createDocument: (...args) => mocks.createDocument(...args),
    updateDocument: (...args) => mocks.updateDocument(...args),
  },
  DB_ID: 'db-test',
  ACADEMIES_COL: 'academies',
}));

import pagbankSetupHandler, {
  validateSetupBody,
  buildPagbankPlanPayload,
  buildSetupIdempotencyKey,
  validatePagbankToken,
  createPagbankPlan,
  fetchPagbankMaxRetries,
} from '../pagbankSetupHandler.js';
import { parsePagbankMaxRetries } from '../pagbankWebhookDecline.js';
import {
  decryptPagbankToken,
  decryptPagbankWebhookSecret,
} from '../pagbankCrypto.js';
import { readPagbankConfig } from '../../pagbankSettings.js';

const TEST_KEY = 'pagbank-test-encryption-key-32chars!!';

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

const basePlan = {
  internal_key: 'GBLP_ADU_MEN_150',
  name: 'Adulto Mensal',
  modality: 'adulto',
  frequency: 'monthly',
  amount: 15000,
};

const validBody = {
  pagbank_token: 'tok_valid',
  plans: [basePlan],
};

describe('validateSetupBody', () => {
  it('rejects empty plans', () => {
    const result = validateSetupBody({ pagbank_token: 'tok', plans: [] });
    expect(result.error).toBe('invalid_payload');
  });

  it('rejects duplicate internal_key', () => {
    const result = validateSetupBody({
      pagbank_token: 'tok',
      plans: [basePlan, { ...basePlan, name: 'Outro' }],
    });
    expect(result.error).toBe('invalid_payload');
    expect(result.detail).toContain('duplicate');
  });

  it('rejects zero amount', () => {
    const result = validateSetupBody({
      pagbank_token: 'tok',
      plans: [{ ...basePlan, amount: 0 }],
    });
    expect(result.error).toBe('invalid_payload');
  });
});

describe('buildPagbankPlanPayload', () => {
  it('maps monthly interval', () => {
    const validated = validateSetupBody(validBody);
    const payload = buildPagbankPlanPayload(validated.plans[0]);
    expect(payload.interval).toEqual({ unit: 'MONTH', length: 1 });
    expect(payload.amount.value).toBe(15000);
  });
});

describe('buildSetupIdempotencyKey', () => {
  it('contains academy and internal key', () => {
    expect(buildSetupIdempotencyKey('ac-1', 'GBLP_ADU_MEN_150')).toBe(
      'setup-ac-1-GBLP_ADU_MEN_150'
    );
  });
});

describe('validatePagbankToken', () => {
  it('accepts 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{}' }));
    const result = await validatePagbankToken('tok');
    expect(result.ok).toBe(true);
  });

  it('rejects 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '{}' }));
    const result = await validatePagbankToken('tok');
    expect(result.error).toBe('invalid_pagbank_token');
  });
});

describe('createPagbankPlan', () => {
  it('marks 409 as existing with plan_id lookup', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 409, text: async () => JSON.stringify({}) })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ plans: [{ id: 'PLAN_EXISTING' }] }),
        })
    );

    const result = await createPagbankPlan('tok', 'ac-1', basePlan);
    expect(result.status).toBe('existing');
    expect(result.plan_id).toBe('PLAN_EXISTING');
  });
});

describe('pagbankSetupHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAGBANK_ENCRYPTION_KEY = TEST_KEY;
    vi.stubGlobal('fetch', vi.fn());
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    mocks.ensureAcademyAccess.mockResolvedValue({
      academyId: 'ac-1',
      doc: { $id: 'ac-1', pagbank_enabled: false },
    });
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(true);
    mocks.listDocuments.mockResolvedValue({ documents: [] });
    mocks.createDocument.mockResolvedValue({ $id: 'plan-doc' });
    mocks.updateDocument.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.PAGBANK_ENCRYPTION_KEY;
  });

  function mockSuccessfulPagbank(planCount = 3) {
    fetch.mockImplementation(async (url, options) => {
      if (String(url).includes('/preferences/retries')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ first_try: '1', second_try: '3', third_try: '7' }),
        };
      }
      if (String(url).includes('/plans?limit=1')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ plans: [] }) };
      }
      if (options?.method === 'POST' && String(url).endsWith('/plans')) {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          status: 201,
          text: async () => JSON.stringify({ id: `PLAN_${body.reference_id}` }),
        };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    });
    return Array.from({ length: planCount }, (_, i) => ({
      ...basePlan,
      internal_key: `PLAN_${i}`,
      name: `Plano ${i}`,
    }));
  }

  it('full setup with 3 plans → summary created: 3', async () => {
    const plans = mockSuccessfulPagbank(3);
    const res = mockRes();
    await pagbankSetupHandler({ method: 'POST', body: { pagbank_token: 'tok', plans } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.summary).toEqual({ total: 3, created: 3, existing: 0, failed: 0 });
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      'academies',
      'ac-1',
      expect.objectContaining({
        pagbank_enabled: true,
        pagbank_max_retries: 3,
      })
    );
    const updatePayload = mocks.updateDocument.mock.calls[0][3];
    expect(updatePayload.pagbank_token).toBeUndefined();
    expect(updatePayload.pagbank_webhook_secret).toBeUndefined();
    const cfg = readPagbankConfig(updatePayload.settings);
    expect(decryptPagbankToken(cfg.token_encrypted)).toBe('tok');
    expect(cfg.token_encrypted).not.toBe('tok');
    expect(decryptPagbankWebhookSecret(cfg.webhook_secret_encrypted)).toBeTruthy();
  });

  it('GET /preferences/retries ok → salva pagbank_max_retries retornado', async () => {
    mockSuccessfulPagbank(1);
    fetch.mockImplementation(async (url, options) => {
      if (String(url).includes('/preferences/retries')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ first_try: '3', second_try: '5' }),
        };
      }
      if (String(url).includes('/plans?limit=1')) {
        return { ok: true, status: 200, text: async () => '{}' };
      }
      if (options?.method === 'POST' && String(url).endsWith('/plans')) {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          status: 201,
          text: async () => JSON.stringify({ id: `PLAN_${body.reference_id}` }),
        };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    });

    const res = mockRes();
    await pagbankSetupHandler({ method: 'POST', body: validBody }, res);
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      'academies',
      'ac-1',
      expect.objectContaining({ pagbank_max_retries: 2 })
    );
  });

  it('GET /preferences/retries falha → setup continua com pagbank_max_retries 3', async () => {
    fetch.mockImplementation(async (url, options) => {
      if (String(url).includes('/preferences/retries')) {
        throw new Error('network');
      }
      if (String(url).includes('/plans?limit=1')) {
        return { ok: true, status: 200, text: async () => '{}' };
      }
      if (options?.method === 'POST' && String(url).endsWith('/plans')) {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          status: 201,
          text: async () => JSON.stringify({ id: `PLAN_${body.reference_id}` }),
        };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    });

    const res = mockRes();
    await pagbankSetupHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(200);
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      'academies',
      'ac-1',
      expect.objectContaining({ pagbank_max_retries: 3 })
    );
  });

  it('parsePagbankMaxRetries via fetchPagbankMaxRetries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ max_retries: 4 }),
      })
    );
    const max = await fetchPagbankMaxRetries('tok');
    expect(max).toBe(4);
    expect(parsePagbankMaxRetries({ max_retries: 4 })).toBe(4);
  });

  it('invalid token → 422', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401, text: async () => '{}' });
    const res = mockRes();
    await pagbankSetupHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('invalid_pagbank_token');
  });

  it('non-admin → 403 forbidden', async () => {
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(false);
    const res = mockRes();
    await pagbankSetupHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  it('generates webhook_secret when absent', async () => {
    mockSuccessfulPagbank(1);
    const res = mockRes();
    await pagbankSetupHandler({ method: 'POST', body: validBody }, res);
    expect(res.body.webhook_secret).toBeTruthy();
    expect(typeof res.body.webhook_secret).toBe('string');
  });

  it('continues when one plan fails with 500', async () => {
    fetch.mockImplementation(async (url, options) => {
      if (String(url).includes('/plans?limit=1')) {
        return { ok: true, status: 200, text: async () => '{}' };
      }
      if (options?.method === 'POST') {
        const body = JSON.parse(options.body);
        if (body.reference_id === 'PLAN_FAIL') {
          return { ok: false, status: 500, text: async () => '{}' };
        }
        return {
          ok: true,
          status: 201,
          text: async () => JSON.stringify({ id: `PLAN_${body.reference_id}` }),
        };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    });

    const res = mockRes();
    await pagbankSetupHandler(
      {
        method: 'POST',
        body: {
          pagbank_token: 'tok',
          plans: [
            { ...basePlan, internal_key: 'PLAN_OK' },
            { ...basePlan, internal_key: 'PLAN_FAIL', name: 'Falha' },
          ],
        },
      },
      res
    );
    expect(res.body.summary.failed).toBe(1);
    expect(res.body.summary.created).toBe(1);
  });

  it('re-runs setup when pagbank_enabled already true', async () => {
    mocks.ensureAcademyAccess.mockResolvedValue({
      academyId: 'ac-1',
      doc: { $id: 'ac-1', pagbank_enabled: true },
    });
    mockSuccessfulPagbank(1);
    const res = mockRes();
    await pagbankSetupHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(200);
    expect(mocks.updateDocument).toHaveBeenCalled();
  });

  it('409 plan marked existing in results', async () => {
    fetch.mockImplementation(async (url, options) => {
      if (String(url).includes('/plans?limit=1')) {
        return { ok: true, status: 200, text: async () => '{}' };
      }
      if (options?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          text: async () => JSON.stringify({ id: 'PLAN_FROM_409' }),
        };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    });

    const res = mockRes();
    await pagbankSetupHandler({ method: 'POST', body: validBody }, res);
    expect(res.body.plans[0].status).toBe('existing');
    expect(res.body.plans[0].plan_id).toBe('PLAN_FROM_409');
  });

  it('sends x-idempotency-key on plan create', async () => {
    mockSuccessfulPagbank(1);
    const res = mockRes();
    await pagbankSetupHandler({ method: 'POST', body: validBody }, res);

    const postCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'POST');
    expect(postCall[1].headers['x-idempotency-key']).toBe('setup-ac-1-GBLP_ADU_MEN_150');
  });
});
