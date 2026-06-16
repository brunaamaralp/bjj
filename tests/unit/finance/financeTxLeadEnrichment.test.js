import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Query: {
    equal: vi.fn((...args) => ({ equal: args })),
    limit: vi.fn((n) => ({ limit: n })),
    select: vi.fn((fields) => ({ select: fields })),
  },
}));

vi.mock('../../../lib/server/appwriteCollections.js', () => ({
  DB_ID: 'db-test',
  LEADS_COL: 'col-leads',
}));

import {
  enrichTransactionsWithLeadNames,
  enrichTransactionWithLeadName,
} from '../../../lib/server/financeTxLeadEnrichment.js';

describe('financeTxLeadEnrichment', () => {
  beforeEach(() => {
    mocks.listDocuments.mockReset();
  });

  function databases() {
    return { listDocuments: mocks.listDocuments };
  }

  it('returns empty array unchanged', async () => {
    expect(await enrichTransactionsWithLeadNames(databases(), 'acad-1', [])).toEqual([]);
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });

  it('skips lookup when no lead_id', async () => {
    const txs = [{ id: 'tx1', lead_id: '', gross: 100 }];
    const out = await enrichTransactionsWithLeadNames(databases(), 'acad-1', txs);
    expect(out[0].lead_name).toBe('');
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });

  it('batch-fetches lead names and attaches lead_name', async () => {
    mocks.listDocuments.mockResolvedValueOnce({
      documents: [
        { $id: 'lead-a', name: 'Ana Silva' },
        { $id: 'lead-b', name: 'Bruno Costa' },
      ],
    });

    const txs = [
      { id: 'tx1', lead_id: 'lead-a' },
      { id: 'tx2', lead_id: 'lead-b' },
      { id: 'tx3', lead_id: 'lead-missing' },
    ];

    const out = await enrichTransactionsWithLeadNames(databases(), 'acad-1', txs);
    expect(out[0].lead_name).toBe('Ana Silva');
    expect(out[1].lead_name).toBe('Bruno Costa');
    expect(out[2].lead_name).toBe('');
    expect(mocks.listDocuments).toHaveBeenCalledTimes(1);
  });

  it('preserves existing lead_name when lookup misses', async () => {
    mocks.listDocuments.mockResolvedValueOnce({ documents: [] });
    const txs = [{ id: 'tx1', lead_id: 'lead-x', lead_name: 'Nome cacheado' }];
    const out = await enrichTransactionsWithLeadNames(databases(), 'acad-1', txs);
    expect(out[0].lead_name).toBe('Nome cacheado');
  });

  it('deduplicates lead ids in one query chunk', async () => {
    mocks.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'lead-a', name: 'Ana' }],
    });
    const txs = [
      { id: 'tx1', lead_id: 'lead-a' },
      { id: 'tx2', lead_id: 'lead-a' },
    ];
    await enrichTransactionsWithLeadNames(databases(), 'acad-1', txs);
    expect(mocks.listDocuments).toHaveBeenCalledTimes(1);
  });

  it('enrichTransactionWithLeadName wraps single tx', async () => {
    mocks.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'lead-1', name: 'Carla' }],
    });
    const out = await enrichTransactionWithLeadName(databases(), 'acad-1', {
      id: 'tx9',
      lead_id: 'lead-1',
    });
    expect(out.lead_name).toBe('Carla');
  });

  it('tolerates Appwrite errors without throwing', async () => {
    mocks.listDocuments.mockRejectedValueOnce(new Error('network'));
    const txs = [{ id: 'tx1', lead_id: 'lead-a', lead_name: 'Fallback' }];
    const out = await enrichTransactionsWithLeadNames(databases(), 'acad-1', txs);
    expect(out[0].lead_name).toBe('Fallback');
  });
});
