import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const TEST_SECRET = 'test-portal-jwt-secret-32chars-min';

import { signPortalJwt, PORTAL_JWT_PURPOSE } from '../portalJwt.js';
import { ensurePortalToken } from '../ensurePortalToken.js';

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

function buildValidPayload(overrides = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    student_id: 'student-1',
    academy_id: 'academy-1',
    plan_internal_key: 'GBLP_ADU_MEN_150',
    student_name: 'Aluno Teste',
    student_email: 'aluno@test.com',
    student_tax_id: '12345678901',
    student_birth_date: '1990-05-15',
    student_phone: '5537999999999',
    purpose: PORTAL_JWT_PURPOSE,
    iat: nowSec,
    exp: nowSec + 3600,
    ...overrides,
  };
}

describe('ensurePortalToken', () => {
  beforeEach(() => {
    process.env.PAGBANK_PORTAL_JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.PAGBANK_PORTAL_JWT_SECRET;
    vi.restoreAllMocks();
  });

  it('valid token → returns full payload', async () => {
    const payload = buildValidPayload();
    const token = signPortalJwt(payload, TEST_SECRET);

    const result = await ensurePortalToken(
      { headers: { 'x-portal-token': token }, body: {} },
      null
    );

    expect(result.error).toBeNull();
    expect(result.payload.student_id).toBe('student-1');
    expect(result.payload.academy_id).toBe('academy-1');
    expect(result.payload.plan_internal_key).toBe('GBLP_ADU_MEN_150');
    expect(result.hadToken).toBe(true);
  });

  it('expired token → null payload + error token_expired', async () => {
    const payload = buildValidPayload({
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    const token = signPortalJwt(payload, TEST_SECRET);
    const res = mockRes();

    const result = await ensurePortalToken({ headers: { 'x-portal-token': token } }, res);

    expect(result.payload).toBeNull();
    expect(result.error).toBe('token_expired');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('token_expired');
  });

  it('wrong purpose → invalid_token_purpose', async () => {
    const payload = buildValidPayload({ purpose: 'other_flow' });
    const token = signPortalJwt(payload, TEST_SECRET);
    const res = mockRes();

    const result = await ensurePortalToken({ headers: { 'x-portal-token': token } }, res);

    expect(result.payload).toBeNull();
    expect(result.error).toBe('invalid_token_purpose');
    expect(res.body.error).toBe('invalid_token_purpose');
  });

  it('missing token → portal_token_required', async () => {
    const res = mockRes();
    const result = await ensurePortalToken({ headers: {}, body: {} }, res);

    expect(result.payload).toBeNull();
    expect(result.error).toBe('portal_token_required');
    expect(result.hadToken).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('malformed token → invalid_portal_token', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = mockRes();

    const result = await ensurePortalToken(
      { headers: { 'x-portal-token': 'not.a.valid-jwt' } },
      res
    );

    expect(result.payload).toBeNull();
    expect(result.error).toBe('invalid_portal_token');
    expect(res.body.error).toBe('invalid_portal_token');
    expect(warnSpy).toHaveBeenCalledWith('[ensurePortalToken] invalid token');
    const loggedRawToken = warnSpy.mock.calls.some((call) =>
      String(call.join(' ')).includes('not.a.valid-jwt')
    );
    expect(loggedRawToken).toBe(false);
  });

  it('reads token from body portal_token when header absent', async () => {
    const payload = buildValidPayload();
    const token = signPortalJwt(payload, TEST_SECRET);

    const result = await ensurePortalToken({ headers: {}, body: { portal_token: token } }, null);

    expect(result.payload?.student_id).toBe('student-1');
  });
});
