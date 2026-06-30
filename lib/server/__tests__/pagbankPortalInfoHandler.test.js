import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
}));

vi.mock('../ensurePortalToken.js', () => ({
  ensurePortalToken: vi.fn(),
}));

vi.mock('../academyAccess.js', () => ({
  databases: {
    listDocuments: (...args) => mocks.listDocuments(...args),
    getDocument: (...args) => mocks.getDocument(...args),
  },
  DB_ID: 'db-test',
  ACADEMIES_COL: 'academies',
}));

import pagbankPortalInfoHandler from '../pagbankPortalInfoHandler.js';
import { ensurePortalToken } from '../ensurePortalToken.js';

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

describe('pagbankPortalInfoHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensurePortalToken).mockResolvedValue({
      payload: {
        student_id: 'student-1',
        academy_id: 'academy-1',
        plan_internal_key: 'GBLP_ADU_MEN_150',
        student_name: 'Aluno Teste',
      },
      error: null,
      hadToken: true,
    });
    mocks.getDocument.mockResolvedValue({ name: 'Academia GBLP' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns plan and student context', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({
        documents: [
          {
            name: 'Adulto Mensal',
            amount: 15000,
            frequency: 'monthly',
            internal_key: 'GBLP_ADU_MEN_150',
          },
        ],
      })
      .mockResolvedValueOnce({ documents: [] });

    const res = mockRes();
    await pagbankPortalInfoHandler({ method: 'GET', headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.student_name).toBe('Aluno Teste');
    expect(res.body.plan_name).toBe('Adulto Mensal');
    expect(res.body.plan_amount).toBe(15000);
    expect(res.body.academy_name).toBe('Academia GBLP');
    expect(res.body.already_subscribed).toBe(false);
  });

  it('returns already_subscribed when active subscription exists', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({
        documents: [{ name: 'Plano', amount: 15000, frequency: 'monthly' }],
      })
      .mockResolvedValueOnce({
        documents: [{ subscription_id: 'SUB_1', status: 'active' }],
      });

    const res = mockRes();
    await pagbankPortalInfoHandler({ method: 'GET', headers: {} }, res);

    expect(res.body.already_subscribed).toBe(true);
    expect(res.body.subscription_id).toBe('SUB_1');
  });

  it('POST returns 405', async () => {
    const res = mockRes();
    await pagbankPortalInfoHandler({ method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
  });
});
