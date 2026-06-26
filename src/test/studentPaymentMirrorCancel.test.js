import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  listDocuments: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (key, value) => ({ op: 'equal', key, value }),
    limit: (value) => ({ op: 'limit', value }),
  },
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  DB_ID: 'db-test',
  databases: {
    getDocument: mocks.getDocument,
    updateDocument: mocks.updateDocument,
    listDocuments: mocks.listDocuments,
  },
}));

describe('studentPaymentMirrorCancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'financial-tx-col';
    mocks.listDocuments.mockImplementation(async (_db, _col, queries) => {
      const q = JSON.stringify(queries || []);
      if (q.includes('student_payment_troco')) {
        return { documents: [{ $id: 'tx-troco', status: 'settled' }] };
      }
      if (q.includes('student_payment')) {
        return { documents: [{ $id: 'tx-main', status: 'settled' }] };
      }
      return { documents: [] };
    });
    mocks.getDocument.mockImplementation(async (_db, _col, id) => ({
      $id: id,
      status: 'settled',
    }));
    mocks.updateDocument.mockResolvedValue({});
  });

  it('cancela principal e troco por origin_id', async () => {
    const { cancelFinancialTxMirrorsForPayment } = await import(
      '../../lib/server/studentPaymentMirrorCancel.js'
    );

    const out = await cancelFinancialTxMirrorsForPayment('pay-1', { explicitTxId: 'tx-explicit' });

    expect(out.cancelledIds.sort()).toEqual(['tx-explicit', 'tx-main', 'tx-troco'].sort());
    expect(mocks.updateDocument).toHaveBeenCalledTimes(3);
  });
});
