import crypto from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  getPagbankCredentials: vi.fn(),
}));

vi.mock('../academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
}));

vi.mock('../getPagbankCredentials.js', () => ({
  getPagbankCredentials: (...args) => mocks.getPagbankCredentials(...args),
}));

vi.mock('../pagbankRequestAuth.js', () => ({
  resolvePagbankRequestAuth: vi.fn(async () => ({
    academyId: 'academy-1',
    studentContext: null,
  })),
}));

import pagbankEncryptHandler from '../pagbankEncryptHandler.js';
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

function generateTestPublicKeyPem() {
  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return publicKey;
}

const validCardBody = {
  number: '4242424242424242',
  exp_month: '12',
  exp_year: '2030',
  security_code: '123',
  holder_name: 'Aluno Teste',
};

describe('pagbankEncryptHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'academy-1', doc: {} });
    mocks.getPagbankCredentials.mockResolvedValue({
      token: 'tok_test',
      publicKey: generateTestPublicKeyPem(),
      webhookSecret: 'whsec',
    });
  });

  it('POST with valid body and publicKey returns 200 with base64 encrypted_card', async () => {
    const res = mockRes();
    await pagbankEncryptHandler({ method: 'POST', body: validCardBody }, res);
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.encrypted_card).toBe('string');
    expect(res.body.encrypted_card.length).toBeGreaterThan(20);
    expect(() => Buffer.from(res.body.encrypted_card, 'base64')).not.toThrow();
  });

  it('GET returns 405', async () => {
    const res = mockRes();
    await pagbankEncryptHandler({ method: 'GET', body: validCardBody }, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('method_not_allowed');
  });

  it('missing number returns 400 with fields', async () => {
    const res = mockRes();
    await pagbankEncryptHandler(
      { method: 'POST', body: { ...validCardBody, number: '' } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('missing_fields');
    expect(res.body.fields).toContain('number');
  });

  it('pagbank_not_enabled returns 403', async () => {
    mocks.getPagbankCredentials.mockRejectedValue(new Error('pagbank_not_enabled'));
    const res = mockRes();
    await pagbankEncryptHandler({ method: 'POST', body: validCardBody }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('pagbank_not_enabled');
  });

  it('invalid public key returns 422', async () => {
    mocks.getPagbankCredentials.mockResolvedValue({
      token: 'tok',
      publicKey: 'not-a-valid-key',
      webhookSecret: 'wh',
    });
    const res = mockRes();
    await pagbankEncryptHandler({ method: 'POST', body: validCardBody }, res);
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('encryption_failed');
    expect(res.body.detail).toBe('invalid_public_key');
  });

  it('invalid auth returns 401 via resolvePagbankRequestAuth', async () => {
    vi.mocked(resolvePagbankRequestAuth).mockImplementationOnce(async (_req, res) => {
      res.status(401).json({ sucesso: false, erro: 'JWT ausente' });
      return null;
    });
    const res = mockRes();
    await pagbankEncryptHandler({ method: 'POST', body: validCardBody }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.erro).toBe('JWT ausente');
  });
});
