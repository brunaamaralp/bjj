import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BANK_MATCH_SUGGEST_SCORE,
  buildReconciliationIndex,
  clearReconciliationBatchCache,
  getExtratoHash,
  getCachedReconciliationBatch,
  lookupCandidatesByAmount,
  matchReconciliationItem,
  reconcileBatch,
  removeFromIndex,
  scoreReconciliationPair,
  setCachedReconciliationBatch,
} from '../lib/bankReconciliationClientMatcher.js';
import { scoreBankItemToTxBase } from '../lib/bankReconciliationScore.js';

function fakeTx({
  id = 'tx1',
  gross = 100,
  net = 100,
  direction = 'in',
  type = 'plan',
  status = 'settled',
  settledAt = '2026-05-10',
  planName = 'Mensalidade João',
  reconciled = false,
} = {}) {
  return { id, gross, net, direction, type, status, settledAt, planName, reconciled };
}

function fakeItem({
  id = 'item1',
  date = '2026-05-10',
  amount = 100,
  direction = 'credit',
  description = 'Pix recebido João',
} = {}) {
  return { id, date, amount, direction, description };
}

describe('bankReconciliationClientMatcher', () => {
  beforeEach(() => {
    clearReconciliationBatchCache();
  });

  describe('buildReconciliationIndex', () => {
    it('indexes by amount cents and supports tolerance lookup', () => {
      const index = buildReconciliationIndex([
        fakeTx({ id: 'a', gross: 150 }),
        fakeTx({ id: 'b', gross: 150.01 }),
        fakeTx({ id: 'c', gross: 200, reconciled: true }),
      ]);

      expect(index.txById.size).toBe(2);
      expect(lookupCandidatesByAmount(index, 15000)).toHaveLength(2);
      expect(lookupCandidatesByAmount(index, 15001)).toHaveLength(2);
      expect(lookupCandidatesByAmount(index, 20000)).toHaveLength(0);
    });

    it('excludes accrual CMV from index', () => {
      const index = buildReconciliationIndex([
        fakeTx({ id: 'cash', gross: 100 }),
        {
          ...fakeTx({ id: 'cmv', gross: 100, direction: 'out', type: 'stock_purchase' }),
          origin_type: 'sale_cmv',
          ledger_regime: 'accrual',
        },
      ]);
      expect(index.txById.size).toBe(1);
      expect(index.txById.has('cmv')).toBe(false);
    });
  });

  describe('matchReconciliationItem', () => {
    it('returns high-confidence single match (score unificado 0–100)', () => {
      const index = buildReconciliationIndex([
        fakeTx({
          id: 'tx1',
          gross: 250,
          settledAt: '2026-05-10',
          planName: 'Pix João Silva',
        }),
      ]);

      const result = matchReconciliationItem(
        fakeItem({
          amount: 250,
          date: '2026-05-10',
          description: 'Pix João Silva',
        }),
        index
      );

      expect(result.displayMode).toBe('single');
      expect(result.suggestedTxId).toBe('tx1');
      expect(result.candidates[0].score).toBe(100);
    });

    it('returns multi candidates when rank_score empatado (mensalidades mesmo dia)', () => {
      const index = buildReconciliationIndex([
        fakeTx({ id: 'tx1', gross: 200, settledAt: '2026-05-10', planName: 'Mensalidade Ana' }),
        fakeTx({ id: 'tx2', gross: 200, settledAt: '2026-05-10', planName: 'Mensalidade Bruno' }),
      ]);

      const result = matchReconciliationItem(
        fakeItem({
          amount: 200,
          date: '2026-05-10',
          description: 'Pix mensalidade',
        }),
        index
      );

      expect(result.displayMode).toBe('multi');
      expect(result.candidates.length).toBeGreaterThanOrEqual(2);
      expect(result.suggestedTxId).toBeNull();
    });

    it('discards candidates with value score 0', () => {
      const index = buildReconciliationIndex([fakeTx({ id: 'tx1', gross: 100 })]);
      const result = matchReconciliationItem(
        fakeItem({ amount: 150, description: 'Pix' }),
        index
      );
      expect(result.displayMode).toBe('none');
      expect(result.candidates).toHaveLength(0);
    });

    it('returns none when no candidate passes minimum score', () => {
      const index = buildReconciliationIndex([
        fakeTx({ id: 'tx1', gross: 100, settledAt: '2026-05-01', planName: 'Outro assunto' }),
      ]);
      const result = matchReconciliationItem(
        fakeItem({
          amount: 50,
          date: '2026-05-10',
          description: 'Completamente diferente xyz',
        }),
        index
      );
      expect(result.displayMode).toBe('none');
    });

    it('prefere candidato com data mais próxima quando scores diferem', () => {
      const index = buildReconciliationIndex([
        fakeTx({ id: 'tx1', gross: 200, settledAt: '2026-05-10' }),
        fakeTx({ id: 'tx2', gross: 200, settledAt: '2026-05-11' }),
      ]);

      const result = matchReconciliationItem(
        fakeItem({ amount: 200, date: '2026-05-10' }),
        index
      );

      expect(result.displayMode).toBe('single');
      expect(result.suggestedTxId).toBe('tx1');
      expect(result.candidates[0].score).toBe(100);
    });
  });

  describe('removeFromIndex', () => {
    it('removes only the reconciled transaction from the index', () => {
      const index = buildReconciliationIndex([
        fakeTx({ id: 'tx1', gross: 100 }),
        fakeTx({ id: 'tx2', gross: 100 }),
      ]);
      removeFromIndex(index, 'tx1');
      expect(index.txById.has('tx1')).toBe(false);
      expect(index.txById.has('tx2')).toBe(true);
      expect(lookupCandidatesByAmount(index, 10000)).toHaveLength(1);
    });
  });

  describe('getExtratoHash and batch cache', () => {
    it('builds stable hash and caches batch results', () => {
      const items = [
        fakeItem({ id: 'a', date: '2026-05-01', amount: 50 }),
        fakeItem({ id: 'b', date: '2026-05-02', amount: 50 }),
      ];
      const hash = getExtratoHash(items);
      expect(hash).toContain('2:100');

      const index = buildReconciliationIndex([fakeTx({ id: 'tx1', gross: 50 })]);
      setCachedReconciliationBatch(hash, { a: { displayMode: 'none', candidates: [] } });
      expect(getCachedReconciliationBatch(hash)).toBeTruthy();
    });
  });

  describe('reconcileBatch', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('processes items in chunks with progress callback', async () => {
      vi.useFakeTimers();
      const index = buildReconciliationIndex([fakeTx({ id: 'tx1', gross: 80 })]);
      const items = Array.from({ length: 25 }, (_, i) =>
        fakeItem({ id: `item-${i}`, amount: 80, description: `Pix ${i}` })
      );

      const progressCalls = [];
      const promise = reconcileBatch(items, index, (processed, total) => {
        progressCalls.push({ processed, total });
      }, { cache: false, chunkSize: 10 });

      await vi.runAllTimersAsync();
      const results = await promise;

      expect(Object.keys(results)).toHaveLength(25);
      expect(progressCalls.at(-1)).toEqual({ processed: 25, total: 25 });
    });

    it('reuses cached batch result for same extrato hash', async () => {
      const items = [fakeItem({ id: 'item-1', amount: 100 })];
      const hash = getExtratoHash(items);
      setCachedReconciliationBatch(hash, {
        'item-1': { displayMode: 'single', suggestedTxId: 'cached', candidates: [] },
      });

      const index = buildReconciliationIndex([]);
      const onProgress = vi.fn();
      const results = await reconcileBatch(items, index, onProgress, { cache: true, cacheKey: hash });

      expect(results['item-1'].suggestedTxId).toBe('cached');
      expect(onProgress).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('scoreReconciliationPair', () => {
    it('rejects direction mismatch', () => {
      const index = buildReconciliationIndex([fakeTx({ id: 'tx1', gross: 100, direction: 'in' })]);
      const entry = index.txById.get('tx1');
      const scored = scoreReconciliationPair(
        fakeItem({ direction: 'debit', amount: 100 }),
        entry
      );
      expect(scored).toBeNull();
    });

    it('uses unified scoreBankItemToTxBase (escala 0–100)', () => {
      const index = buildReconciliationIndex([fakeTx({ id: 'tx1', gross: 100 })]);
      const entry = index.txById.get('tx1');
      const item = fakeItem({ amount: 100, date: '2026-05-10' });
      const scored = scoreReconciliationPair(item, entry);
      expect(scored.score).toBe(scoreBankItemToTxBase(item, entry.tx));
      expect(scored.score).toBeGreaterThanOrEqual(BANK_MATCH_SUGGEST_SCORE);
    });
  });
});
