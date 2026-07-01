import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildCategoryIndex,
  filterEntriesForCategoryIndex,
  jaccardSimilarity,
  normalizeFinanceDescriptionText,
  suggestCategory,
  tokenizeFinanceDescription,
  FINANCE_CATEGORY_SUGGESTION_DEFAULT_THRESHOLD,
} from '../lib/financeCategorySuggestion.js';

function tx({ id, planName, category, direction = 'out', settledAt, status = 'settled' }) {
  return {
    id,
    planName,
    category,
    direction,
    status,
    settledAt: settledAt || '2026-05-01T12:00:00.000Z',
    createdAt: settledAt || '2026-05-01T12:00:00.000Z',
  };
}

describe('financeCategorySuggestion', () => {
  describe('normalizeFinanceDescriptionText', () => {
    it('lowercases, removes accents and punctuation', () => {
      expect(normalizeFinanceDescriptionText('Salário Hugo — ref. maio!')).toBe('salario hugo ref maio');
    });
  });

  describe('tokenizeFinanceDescription', () => {
    it('removes stopwords and short tokens', () => {
      const tokens = tokenizeFinanceDescription('Pagamento de salário referente ao Hugo');
      expect(tokens.has('salario')).toBe(true);
      expect(tokens.has('hugo')).toBe(true);
      expect(tokens.has('pagamento')).toBe(false);
      expect(tokens.has('referente')).toBe(false);
      expect(tokens.has('de')).toBe(false);
    });
  });

  describe('jaccardSimilarity', () => {
    it('computes intersection over union', () => {
      const a = new Set(['salario', 'hugo']);
      const b = new Set(['salario', 'hugo', 'funcionario']);
      expect(jaccardSimilarity(a, b)).toBeCloseTo(2 / 3);
    });

    it('returns 0 when there is no overlap', () => {
      expect(jaccardSimilarity(new Set(['a']), new Set(['b']))).toBe(0);
    });
  });

  describe('filterEntriesForCategoryIndex', () => {
    it('keeps only same direction and recent entries', () => {
      const old = tx({
        id: 'old',
        planName: 'Aluguel antigo',
        category: 'Aluguel',
        settledAt: '2024-01-01T12:00:00.000Z',
      });
      const recent = tx({
        id: 'new',
        planName: 'Aluguel maio',
        category: 'Aluguel',
        settledAt: '2026-05-01T12:00:00.000Z',
      });
      const entrada = tx({
        id: 'in',
        planName: 'Mensalidade João',
        category: 'Mensalidade',
        direction: 'in',
      });

      const filtered = filterEntriesForCategoryIndex([old, recent, entrada], { direction: 'out' });
      expect(filtered.map((t) => t.id)).toEqual(['new']);
    });
  });

  describe('buildCategoryIndex', () => {
    it('builds inverted index with token category weights', () => {
      const index = buildCategoryIndex(
        [
          tx({ id: '1', planName: 'Salário Hugo', category: 'Salários' }),
          tx({ id: '2', planName: 'Salário Maria', category: 'Salários' }),
          tx({ id: '3', planName: 'Compra frutas mercado', category: 'Alimentação' }),
        ],
        { direction: 'out' }
      );

      expect(index.entries).toHaveLength(3);
      expect(index.invertedIndex.get('salario')).toHaveLength(2);
      expect(index.tokenCategoryWeights.get('salario')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'Salários', weight: 0.5 }),
        ])
      );
    });
  });

  describe('suggestCategory', () => {
    const history = [
      tx({ id: '1', planName: 'Salário Hugo funcionário', category: 'Salários' }),
      tx({ id: '2', planName: 'Salário Maria funcionária', category: 'Salários' }),
      tx({ id: '3', planName: 'Compra frutas mercado', category: 'Alimentação' }),
    ];

    let index;
    /** @type {Map<string, { category: string, confidence: number } | null>} */
    let cache;

    beforeEach(() => {
      index = buildCategoryIndex(history, { direction: 'out' });
      cache = new Map();
    });

    it('returns best category by aggregated Jaccard score', () => {
      const result = suggestCategory('salario hugo funcionario', { index, cache });
      expect(result).toEqual(
        expect.objectContaining({ category: 'Salários', confidence: expect.any(Number) })
      );
      expect(result.confidence).toBeGreaterThanOrEqual(FINANCE_CATEGORY_SUGGESTION_DEFAULT_THRESHOLD);
    });

    it('returns null when score is below threshold', () => {
      const result = suggestCategory('xyz abc desconhecido', {
        index,
        cache,
        threshold: 0.99,
      });
      expect(result).toBeNull();
    });

    it('returns null for empty or stopword-only descriptions', () => {
      expect(suggestCategory('', { index, cache })).toBeNull();
      expect(suggestCategory('pagamento de valor', { index, cache })).toBeNull();
    });

    it('uses session cache for repeated normalized descriptions', () => {
      const spy = vi.spyOn(index.invertedIndex, 'get');
      const first = suggestCategory('Salário Hugo', { index, cache });
      const second = suggestCategory('salario hugo', { index, cache });
      expect(first).toEqual(second);
      expect(spy.mock.calls.length).toBeGreaterThan(0);
      const callsAfterFirst = spy.mock.calls.length;
      suggestCategory('salario hugo', { index, cache });
      expect(spy.mock.calls.length).toBe(callsAfterFirst);
      spy.mockRestore();
    });

    it('aggregates similarity sums per category instead of match counts', () => {
      const sparse = buildCategoryIndex(
        [
          tx({ id: '1', planName: 'Salário Hugo', category: 'Salários' }),
          tx({ id: '2', planName: 'Compra frutas', category: 'Alimentação' }),
        ],
        { direction: 'out' }
      );
      const result = suggestCategory('salario hugo', { index: sparse, cache: new Map(), threshold: 0.2 });
      expect(result?.category).toBe('Salários');
      expect(result?.confidence).toBeGreaterThan(0.3);
    });
  });
});

describe('useFinanceCategorySuggestion', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces before computing suggestion', async () => {
    vi.useFakeTimers();
    const { renderHook, act } = await import('@testing-library/react');
    const useFinanceCategorySuggestion = (await import('../hooks/useFinanceCategorySuggestion.js')).default;

    const transactions = [
      tx({ id: '1', planName: 'Salário Hugo', category: 'Salários' }),
      tx({ id: '2', planName: 'Salário Maria', category: 'Salários' }),
    ];

    const { result, rerender } = renderHook(
      ({ description }) =>
        useFinanceCategorySuggestion({
          transactions,
          direction: 'out',
          description,
          enabled: true,
        }),
      { initialProps: { description: '' } }
    );

    expect(result.current).toBeNull();

    rerender({ description: 'salario hugo' });
    expect(result.current).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      await Promise.resolve();
      vi.runAllTimers();
    });

    expect(result.current?.category).toBe('Salários');
  });
});
