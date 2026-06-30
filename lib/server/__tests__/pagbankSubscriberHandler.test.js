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

import pagbankSubscriberHandler, {
  validateSubscriberBody,
  buildPagbankCustomerPayload,
} from '../pagbankSubscriberHandler.js';
import { resolvePagbankRequestAuth } from '../pagbankRequestAuth.js';

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
  encrypted_card: 'abc123encrypted',
  student_id: 'student-1',
  name: 'Aluno Teste',
  email: 'aluno@teste.com',
  tax_id: '12345678901',
  birth_date: '1990-05-15',
  phone: { country: '55', area: '37', number: '999999999' },
};

describe('validateSubscriberBody', () => {
  it('accepts valid payload', () => {
    const result = validateSubscriberBody(validBody);
    expect(result.error).toBeUndefined();
    expect(result.tax_id).toBe('12345678901');
  });

  it('flags missing number', () => {
    const result = validateSubscriberBody({ ...validBody, encrypted_card: '' });
    expect(result.error).toBe('missing_fields');
    expect(result.fields).toContain('encrypted_card');
  });

  it('rejects invalid tax_id', () => {
    const result = validateSubscriberBody({ ...validBody, tax_id: '123' });
    expect(result.error).toBe('invalid_tax_id');
  });
});

describe('buildPagbankCustomerPayload', () => {
  it('includes encrypted card in billing_info', () => {
    const validated = validateSubscriberBody(validBody);
    const payload = buildPagbankCustomerPayload({
      academyId: 'ac-1',
      studentId: 'student-1',
      data: validated,
    });
    expect(payload.billing_info[0].card.encrypted).toBe('abc123encrypted');
    expect(payload.phones[0].country).toBe('55');
  });
});

describe('pagbankSubscriberHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'ac-1', doc: {} });
    mocks.getPagbankCredentials.mockResolvedValue({
      token: 'tok_test',
      publicKey: 'pk',
      webhookSecret: 'wh',
    });
    mocks.listDocuments.mockResolvedValue({ documents: [] });
    mocks.createDocument.mockResolvedValue({ $id: 'doc-1' });
  });

  it('GET returns 405', async () => {
    const res = mockRes();
    await pagbankSubscriberHandler({ method: 'GET', body: validBody }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns existing subscriber without calling PagBank', async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [
        {
          subscriber_id: 'CUST_EXISTING',
          card_last4: '4242',
          card_brand: 'visa',
        },
      ],
    });
    const res = mockRes();
    await pagbankSubscriberHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.existing).toBe(true);
    expect(res.body.subscriber_id).toBe('CUST_EXISTING');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates subscriber on PagBank and persists in Appwrite', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'CUST_NEW',
          billing_info: [{ card: { last_digits: '1111', brand: 'visa' } }],
        }),
    });

    const res = mockRes();
    await pagbankSubscriberHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.subscriber_id).toBe('CUST_NEW');
    expect(res.body.card_last4).toBe('1111');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.createDocument).toHaveBeenCalledTimes(1);
  });

  it('pagbank_not_enabled returns 403', async () => {
    mocks.getPagbankCredentials.mockRejectedValue(new Error('pagbank_not_enabled'));
    const res = mockRes();
    await pagbankSubscriberHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(403);
  });

  it('invalid auth returns 401 via resolvePagbankRequestAuth', async () => {
    vi.mocked(resolvePagbankRequestAuth).mockImplementationOnce(async (_req, res) => {
      res.status(401).json({ sucesso: false, erro: 'JWT ausente' });
      return null;
    });
    const res = mockRes();
    await pagbankSubscriberHandler({ method: 'POST', body: validBody }, res);
    expect(res.statusCode).toBe(401);
  });

  it('missing phone returns 400 because PagBank exige telefone', async () => {
    const res = mockRes();
    await pagbankSubscriberHandler(
      { method: 'POST', body: { ...validBody, phone: undefined } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.fields).toContain('phone');
  });
});
