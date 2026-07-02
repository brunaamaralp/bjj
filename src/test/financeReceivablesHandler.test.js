import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  loadReceivablesSnapshotBundle: vi.fn(),
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  ACADEMIES_COL: 'academies',
  DB_ID: 'db',
  databases: { getDocument: vi.fn() },
}));

vi.mock('../../lib/server/financeReceivablesSnapshot.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadReceivablesSnapshotBundle: (...args) => mocks.loadReceivablesSnapshotBundle(...args),
  };
});

import financeReceivablesHandler from '../../lib/server/financeReceivablesHandler.js';

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('financeReceivablesHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'ac-1', doc: { ownerId: 'user-1' } });
    mocks.loadReceivablesSnapshotBundle.mockResolvedValue({
      snapshot: {
        summary: { total: 300, count: 3, bySource: {} },
        items: [
          { id: '1', source: 'mensalidade', label: 'A', amount: 100 },
          { id: '2', source: 'mensalidade', label: 'B', amount: 100 },
          { id: '3', source: 'lancamento', label: 'C', amount: 100 },
        ],
        referenceMonth: '2026-07',
      },
      cobrancaSummary: { students: 2, totalOpen: 150 },
    });
  });

  it('rejects missing month', async () => {
    const res = mockRes();
    await financeReceivablesHandler({ method: 'GET', query: { route: 'receivables' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('paginates items and includes cobranca summary', async () => {
    const res = mockRes();
    await financeReceivablesHandler(
      {
        method: 'GET',
        query: {
          month: '2026-07',
          section: 'visao',
          limit: '2',
          offset: '1',
          includeCobranca: '1',
        },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.pagination).toEqual({
      offset: 1,
      limit: 2,
      total: 3,
      hasMore: false,
    });
    expect(res.body.cobrancaSummary).toEqual({ students: 2, totalOpen: 150 });
    expect(mocks.loadReceivablesSnapshotBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        academyId: 'ac-1',
        referenceMonth: '2026-07',
        includeCobranca: true,
      })
    );
  });
});
