import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (...args) => ({ op: 'equal', args }),
    limit: (n) => ({ op: 'limit', n }),
    orderDesc: (f) => ({ op: 'orderDesc', f }),
    greaterThanEqual: (f, v) => ({ op: 'gte', f, v }),
    lessThanEqual: (f, v) => ({ op: 'lte', f, v }),
    cursorAfter: (c) => ({ op: 'cursor', c }),
  },
}));

const listDocuments = vi.fn();

vi.mock('../../lib/server/academyAccess.js', () => ({
  DB_ID: 'db',
  databases: { listDocuments },
}));

vi.mock('../../lib/server/financeTxFields.js', () => ({
  mapFinanceTxDoc: (d) => ({ ...d, id: d.$id }),
}));

describe('financeTxQuery truncated', () => {
  beforeEach(() => {
    listDocuments.mockReset();
  });

  it('sets truncated when maxCollect reached', async () => {
    const { collectFinancialTxForPeriod } = await import('../../lib/server/financeTxQuery.js');
    const docs = Array.from({ length: 100 }, (_, i) => ({
      $id: `tx${i}`,
      academyId: 'a1',
      status: 'settled',
      gross: 10,
      settledAt: '2026-06-01T12:00:00.000Z',
      $createdAt: '2026-06-01T12:00:00.000Z',
    }));
    listDocuments.mockImplementation(() =>
      Promise.resolve({ documents: docs })
    );

    const { items, truncated } = await collectFinancialTxForPeriod('a1', {
      from: '2026-06-01',
      to: '2026-06-30',
      maxCollect: 50,
    });
    expect(truncated).toBe(true);
    expect(items.length).toBe(50);
  });
});
