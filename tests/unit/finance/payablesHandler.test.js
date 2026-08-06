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
      settledRecurrenceInstances: [],
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
      settledRecurrenceInstances: [],
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

  it('does not re-list settled competence as open template in contas-fixas', async () => {
    mocks.loadPayablesInputs.mockResolvedValue({
      pendingTransactions: [],
      recurrenceTemplates: [
        {
          id: 'tpl-1',
          is_recurrence_template: true,
          direction: 'out',
          recurrence_type: 'monthly',
          recurrence_day: 10,
          gross: 450,
          planName: 'CPFL',
          category: 'Luz / energia',
        },
      ],
      settledRecurrenceInstances: [
        {
          id: 's1',
          status: 'settled',
          direction: 'out',
          gross: 450,
          recurrence_origin_id: 'tpl-1',
          competence_month: '2026-08',
          due_date: '2026-08-10',
        },
      ],
      pendingTruncated: false,
    });
    const res = mockRes();
    await payablesHandler(
      {
        method: 'GET',
        query: {
          route: 'payables',
          section: 'contas-fixas',
          from: '2026-08-01',
          to: '2026-09-30',
          refresh: '1',
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    const augustOpen = (res.body.items || []).find(
      (it) => it.template_id === 'tpl-1' && String(it.due_date || '').startsWith('2026-08')
    );
    expect(augustOpen).toBeUndefined();
  });
});
