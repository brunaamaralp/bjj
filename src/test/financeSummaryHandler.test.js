import { describe, it, expect, vi, beforeEach } from 'vitest';

const listFinancialTxForPeriodWithMeta = vi.fn();
const ensureAuth = vi.fn();
const ensureAcademyAccess = vi.fn();

vi.mock('../../lib/server/financeTxQuery.js', () => ({
  listFinancialTxForPeriodWithMeta,
  MAX_TX_COLLECT_PER_PERIOD: 2500,
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  ensureAuth,
  ensureAcademyAccess,
}));

describe('financeSummaryHandler', () => {
  beforeEach(() => {
    listFinancialTxForPeriodWithMeta.mockReset();
    ensureAuth.mockReset();
    ensureAcademyAccess.mockReset();
  });

  function mockRes() {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    return res;
  }

  it('returns early when unauthenticated', async () => {
    const handler = (await import('../../lib/server/financeSummaryHandler.js')).default;
    ensureAuth.mockImplementation(async (_req, res) => {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return null;
    });
    const res = mockRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('returns summary with truncated flag', async () => {
    const handler = (await import('../../lib/server/financeSummaryHandler.js')).default;
    ensureAuth.mockResolvedValue({ $id: 'u1' });
    ensureAcademyAccess.mockResolvedValue({ academyId: 'a1' });
    listFinancialTxForPeriodWithMeta.mockResolvedValue({
      items: [{ id: 't1', status: 'settled', gross: 100, net: 100, type: 'plan' }],
      truncated: true,
      totalInPeriod: 3000,
      maxCollect: 2500,
    });

    const res = mockRes();
    await handler({
      method: 'GET',
      query: { from: '2026-06-01', to: '2026-06-30', regime: 'cash' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.truncated).toBe(true);
    expect(res.body.settledIn).toBe(100);
    expect(res.headers['Cache-Control']).toMatch(/max-age=/);
  });

  it('returns 405 for non-GET', async () => {
    const handler = (await import('../../lib/server/financeSummaryHandler.js')).default;
    const res = mockRes();
    await handler({ method: 'POST', query: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('method_not_allowed');
  });
});
