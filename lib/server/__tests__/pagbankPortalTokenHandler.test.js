import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const TEST_SECRET = 'test-portal-jwt-secret-32chars-min';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
}));

vi.mock('../academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  databases: {
    getDocument: (...args) => mocks.getDocument(...args),
    listDocuments: (...args) => mocks.listDocuments(...args),
  },
  DB_ID: 'db-test',
}));

import pagbankPortalTokenHandler from '../pagbankPortalTokenHandler.js';
import { verifyPortalJwt } from '../portalJwt.js';

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.setHeader = (key, value) => {
    res.headers[key] = value;
  };
  return res;
}

describe('pagbankPortalTokenHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAGBANK_PORTAL_JWT_SECRET = TEST_SECRET;
    process.env.VITE_APP_URL = 'https://app.nave.test';
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-staff' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'academy-1' });
  });

  afterEach(() => {
    delete process.env.PAGBANK_PORTAL_JWT_SECRET;
    delete process.env.VITE_APP_URL;
  });

  it('staff generates token successfully → 200 with portal_url containing token', async () => {
    mocks.getDocument.mockResolvedValue({
      $id: 'student-1',
      academyId: 'academy-1',
      name: 'Aluno Teste',
      email: 'aluno@test.com',
      cpf: '12345678901',
      birth_date: '1990-05-15',
      phone: '5537999999999',
    });
    mocks.listDocuments
      .mockResolvedValueOnce({
        documents: [{ name: 'Plano Adulto', plan_id: 'PLAN_1', internal_key: 'GBLP_ADU_MEN_150' }],
      })
      .mockResolvedValueOnce({ documents: [] });

    const res = mockRes();
    await pagbankPortalTokenHandler(
      {
        method: 'POST',
        body: { student_id: 'student-1', plan_internal_key: 'GBLP_ADU_MEN_150' },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.portal_url).toContain('https://app.nave.test/cartao/');
    expect(res.body.expires_in_hours).toBe(48);
    expect(res.body.student_name).toBe('Aluno Teste');
    expect(res.body.plan_name).toBe('Plano Adulto');

    const token = decodeURIComponent(res.body.portal_url.split('/cartao/')[1]);
    const payload = verifyPortalJwt(token, TEST_SECRET);
    expect(payload.purpose).toBe('pagbank_card_enrollment');
    expect(payload.student_id).toBe('student-1');
    expect(payload.plan_internal_key).toBe('GBLP_ADU_MEN_150');
    expect(payload.exp - payload.iat).toBe(48 * 3600);
  });

  it('student not in academy → 403', async () => {
    mocks.getDocument.mockResolvedValue({
      $id: 'student-1',
      academyId: 'other-academy',
      name: 'Aluno',
    });

    const res = mockRes();
    await pagbankPortalTokenHandler(
      {
        method: 'POST',
        body: { student_id: 'student-1', plan_internal_key: 'GBLP_ADU_MEN_150' },
      },
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('student_not_in_academy');
  });

  it('plan not found or inactive → 404', async () => {
    mocks.getDocument.mockResolvedValue({
      $id: 'student-1',
      academyId: 'academy-1',
      name: 'Aluno',
    });
    mocks.listDocuments.mockResolvedValueOnce({ documents: [] });

    const res = mockRes();
    await pagbankPortalTokenHandler(
      {
        method: 'POST',
        body: { student_id: 'student-1', plan_internal_key: 'MISSING_PLAN' },
      },
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('plan_not_found');
  });

  it('student already subscribed → 200 already_subscribed', async () => {
    mocks.getDocument.mockResolvedValue({
      $id: 'student-1',
      academyId: 'academy-1',
      name: 'Aluno',
    });
    mocks.listDocuments
      .mockResolvedValueOnce({
        documents: [{ name: 'Plano', internal_key: 'GBLP_ADU_MEN_150' }],
      })
      .mockResolvedValueOnce({
        documents: [{ subscription_id: 'SUB_123', status: 'active' }],
      });

    const res = mockRes();
    await pagbankPortalTokenHandler(
      {
        method: 'POST',
        body: { student_id: 'student-1', plan_internal_key: 'GBLP_ADU_MEN_150' },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.already_subscribed).toBe(true);
    expect(res.body.subscription_id).toBe('SUB_123');
    expect(res.body.status).toBe('active');
  });

  it('missing student_id → 400', async () => {
    const res = mockRes();
    await pagbankPortalTokenHandler(
      {
        method: 'POST',
        body: { plan_internal_key: 'GBLP_ADU_MEN_150' },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.fields).toContain('student_id');
  });

  it('invalid staff auth → 401', async () => {
    mocks.ensureAuth.mockImplementationOnce(async (_req, res) => {
      res.status(401).json({ sucesso: false, erro: 'JWT ausente' });
      return null;
    });

    const res = mockRes();
    await pagbankPortalTokenHandler(
      {
        method: 'POST',
        body: { student_id: 'student-1', plan_internal_key: 'GBLP_ADU_MEN_150' },
      },
      res
    );

    expect(res.statusCode).toBe(401);
  });

  it('GET returns 405', async () => {
    const res = mockRes();
    await pagbankPortalTokenHandler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });
});
