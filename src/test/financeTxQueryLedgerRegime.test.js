import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (k, v) => ({ op: 'eq', k, v }),
    greaterThanEqual: (k, v) => ({ op: 'gte', k, v }),
    lessThanEqual: (k, v) => ({ op: 'lte', k, v }),
    limit: (n) => ({ op: 'limit', n }),
    orderDesc: (k) => ({ op: 'orderDesc', k }),
    cursorAfter: (c) => ({ op: 'cursor', c }),
  },
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  databases: { listDocuments: mocks.listDocuments },
  DB_ID: 'db-test',
}));

describe('financeTxQuery ledger_regime filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'tx-col';
    mocks.listDocuments.mockResolvedValue({
      documents: [
        {
          $id: 'tx-cash',
          academyId: 'ac-1',
          type: 'product',
          gross: 100,
          net: 100,
          status: 'settled',
          settledAt: '2026-06-15T12:00:00.000Z',
          competence_month: '2026-06',
          ledger_regime: 'cash',
        },
        {
          $id: 'tx-cmv',
          academyId: 'ac-1',
          type: 'stock_purchase',
          gross: 40,
          net: 40,
          status: 'settled',
          settledAt: '2026-06-15T12:00:00.000Z',
          competence_month: '2026-06',
          origin_type: 'sale_cmv',
          ledger_regime: 'accrual',
          direction: 'out',
        },
      ],
    });
  });

  it('regime cash excludes accrual CMV', async () => {
    const { listFinancialTxForPeriod } = await import('../../lib/server/financeTxQuery.js');
    const items = await listFinancialTxForPeriod('ac-1', {
      from: '2026-06-01',
      to: '2026-06-30',
      regime: 'cash',
    });
    expect(items.map((t) => t.id)).toEqual(['tx-cash']);
  });

  it('regime competence includes accrual CMV', async () => {
    const { listFinancialTxForPeriod } = await import('../../lib/server/financeTxQuery.js');
    const items = await listFinancialTxForPeriod('ac-1', {
      from: '2026-06-01',
      to: '2026-06-30',
      regime: 'competence',
    });
    expect(items.map((t) => t.id).sort()).toEqual(['tx-cash', 'tx-cmv'].sort());
  });
});
