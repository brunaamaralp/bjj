import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  isAcademyOwnerOrAdminUser: vi.fn(),
  loadPayablesInputs: vi.fn(),
}));

vi.mock('../../../lib/server/academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  isAcademyOwnerOrAdminUser: (...args) => mocks.isAcademyOwnerOrAdminUser(...args),
}));

vi.mock('../../../lib/server/payablesData.js', () => ({
  loadPayablesInputs: (...args) => mocks.loadPayablesInputs(...args),
}));

import payablesHandler from '../../../lib/server/payablesHandler.js';

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

describe('payablesHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'ac-1', doc: { ownerId: 'user-1' } });
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(true);
    mocks.loadPayablesInputs.mockResolvedValue({
      pendingTransactions: [],
      recurrenceTemplates: [],
      pendingTruncated: false,
    });
  });

  it('rejects non-GET', async () => {
    const res = mockRes();
    await payablesHandler({ method: 'POST', query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('allows any academy member with finance access', async () => {
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(false);
    const res = mockRes();
    await payablesHandler({ method: 'GET', query: { route: 'payables', section: 'visao' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns payables payload with catalog', async () => {
    const res = mockRes();
    await payablesHandler({ method: 'GET', query: { route: 'payables', section: 'visao' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.catalog).toBeDefined();
    expect(Array.isArray(res.body.catalog.pending)).toBe(true);
  });

  it('filters vencidas section', async () => {
    mocks.loadPayablesInputs.mockResolvedValue({
      pendingTransactions: [
        {
          id: 'tx-1',
          status: 'pending',
          direction: 'out',
          gross: 90,
          planName: 'CPFL',
          category: 'Luz / energia',
          due_date: '2020-01-10',
        },
      ],
      recurrenceTemplates: [],
      pendingTruncated: false,
    });
    const res = mockRes();
    await payablesHandler(
      { method: 'GET', query: { route: 'payables', section: 'vencidas' } },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.items.every((it) => it.status === 'overdue')).toBe(true);
  });
});
