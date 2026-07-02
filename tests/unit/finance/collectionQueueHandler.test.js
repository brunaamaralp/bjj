import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  listAcademyStudentsMapped: vi.fn(),
  listGridPaymentsForAcademy: vi.fn(),
  mergeFinanceConfigFromAcademyDoc: vi.fn(),
}));

vi.mock('../../../lib/server/academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  ACADEMIES_COL: 'academies',
  DB_ID: 'db',
  databases: {},
}));

vi.mock('../../../lib/server/listAcademyStudents.js', () => ({
  listAcademyStudentsMapped: (...args) => mocks.listAcademyStudentsMapped(...args),
}));

vi.mock('../../../lib/server/financeReceivablesData.js', () => ({
  listGridPaymentsForAcademy: (...args) => mocks.listGridPaymentsForAcademy(...args),
}));

vi.mock('../../../src/lib/financeConfigStorage.js', () => ({
  mergeFinanceConfigFromAcademyDoc: (...args) => mocks.mergeFinanceConfigFromAcademyDoc(...args),
}));

import collectionQueueHandler from '../../../lib/server/collectionQueueHandler.js';

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

describe('collectionQueueHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    mocks.ensureAcademyAccess.mockResolvedValue({
      academyId: 'ac-1',
      doc: { financeConfig: '{}' },
    });
    mocks.mergeFinanceConfigFromAcademyDoc.mockReturnValue({
      plans: [{ name: 'Mensal', price: 200 }],
    });
    mocks.listAcademyStudentsMapped.mockResolvedValue([]);
    mocks.listGridPaymentsForAcademy.mockResolvedValue({ rows: [], truncated: false });
  });

  it('rejects non-GET', async () => {
    const res = mockRes();
    await collectionQueueHandler({ method: 'POST', query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns queue payload', async () => {
    const res = mockRes();
    await collectionQueueHandler({ method: 'GET', query: { route: 'collection-queue' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(Array.isArray(res.body.rows)).toBe(true);
  });
});
