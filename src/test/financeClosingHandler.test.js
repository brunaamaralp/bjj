import { describe, it, expect, vi, beforeEach } from 'vitest';

const ensureAuth = vi.fn();
const ensureAcademyOwnerOrAdmin = vi.fn();
const getDocument = vi.fn();
const listDocuments = vi.fn();
const createDocument = vi.fn();

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (...args) => ({ op: 'equal', args }),
    limit: (n) => ({ op: 'limit', n }),
    orderDesc: (f) => ({ op: 'orderDesc', f }),
    greaterThanEqual: (f, v) => ({ op: 'gte', f, v }),
    lessThanEqual: (f, v) => ({ op: 'lte', f, v }),
    cursorAfter: (c) => ({ op: 'cursor', c }),
  },
  ID: { unique: () => 'closing-id-1' },
  Permission: { read: () => 'read' },
  Role: { users: () => 'users' },
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  ensureAuth,
  ensureAcademyOwnerOrAdmin,
  ACADEMIES_COL: 'academies',
  DB_ID: 'db',
  databases: {
    getDocument,
    listDocuments,
    createDocument,
  },
}));

vi.mock('../../lib/server/listAcademyStudents.js', () => ({
  academyStudentsLeadById: vi.fn().mockResolvedValue(new Map()),
}));

describe('financeClosingHandler POST', () => {
  beforeEach(() => {
    ensureAuth.mockReset();
    ensureAcademyOwnerOrAdmin.mockReset();
    getDocument.mockReset();
    listDocuments.mockReset();
    createDocument.mockReset();
  });

  function mockRes() {
    const res = {
      statusCode: 200,
      body: null,
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

  it('rejects snapshot_mismatch on POST', async () => {
    process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'tx';
    process.env.APPWRITE_CASH_CLOSING_COLLECTION_ID = 'closing';
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = 'pay';

    const handler = (await import('../../lib/server/financeClosingHandler.js')).default;
    ensureAuth.mockResolvedValue({ $id: 'u1' });
    ensureAcademyOwnerOrAdmin.mockResolvedValue({ academyId: 'a1' });

    getDocument.mockResolvedValue({ financeConfig: '{}' });
    listDocuments.mockImplementation((_db, col) => {
      if (col === 'closing') return Promise.resolve({ documents: [] });
      if (col === 'pay') return Promise.resolve({ documents: [] });
      if (col === 'tx') return Promise.resolve({ documents: [] });
      return Promise.resolve({ documents: [] });
    });

    const res = mockRes();
    await handler({
      method: 'POST',
      body: {
        reference_month: '2026-06',
        regime: 'cash',
        snapshot: { totals: { expected: 500, received: 400, pending: 100 } },
      },
    }, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('snapshot_mismatch');
  });
});
