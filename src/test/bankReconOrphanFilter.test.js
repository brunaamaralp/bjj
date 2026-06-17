import { describe, expect, it } from 'vitest';
import { filterBankReconOrphans, isOrphanCandidateForItem } from '../lib/bankReconOrphanFilter.js';

describe('bankReconOrphanFilter', () => {
  const orphans = [
    {
      id: 'tx-1',
      gross: 100,
      settledAt: '2026-01-15',
      planName: 'Mensalidade João',
      lead_name: 'João Silva',
      direction: 'in',
    },
    {
      id: 'tx-2',
      gross: 50,
      settledAt: '2026-01-16',
      category: 'Taxa banco',
      direction: 'out',
    },
    {
      id: 'tx-3',
      gross: 200,
      settledAt: '2026-02-01',
      category: 'Mensalidades',
      lead_name: 'Ana Costa',
      direction: 'in',
    },
  ];

  it('isOrphanCandidateForItem matches by date and amount', () => {
    const item = { date: '2026-01-15', amount: 100 };
    expect(isOrphanCandidateForItem(orphans[0], item)).toBe(true);
    expect(isOrphanCandidateForItem(orphans[2], item)).toBe(false);
  });

  it('filterBankReconOrphans filters by selected line when showAll is false', () => {
    const item = { date: '2026-01-15', amount: 100 };
    const result = filterBankReconOrphans(orphans, { selectedItem: item, showAll: false });
    expect(result.map((t) => t.id)).toEqual(['tx-1']);
  });

  it('filterBankReconOrphans filters by search query', () => {
    const result = filterBankReconOrphans(orphans, { query: 'ana' });
    expect(result.map((t) => t.id)).toEqual(['tx-3']);
  });

  it('filterBankReconOrphans filters by direction', () => {
    const result = filterBankReconOrphans(orphans, { direction: 'out' });
    expect(result.map((t) => t.id)).toEqual(['tx-2']);
  });

  it('filterBankReconOrphans combines line filter and search', () => {
    const item = { date: '2026-01-15', amount: 100 };
    const result = filterBankReconOrphans(orphans, {
      selectedItem: item,
      showAll: true,
      query: 'joão',
    });
    expect(result.map((t) => t.id)).toEqual(['tx-1']);
  });
});
