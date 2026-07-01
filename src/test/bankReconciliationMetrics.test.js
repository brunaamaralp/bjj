import { describe, expect, it } from 'vitest';
import {
  buildImportMetricsSnapshot,
  buildMatchConfirmedMetrics,
  buildStatementCompletionMetrics,
  buildStaleOrphanScanMetrics,
  classifyImportLayer,
} from '../lib/bankReconciliationMetrics.js';
import { BANK_MATCH_SUGGEST_SCORE } from '../lib/bankReconciliationScore.js';

describe('bankReconciliationMetrics', () => {
  it('classifyImportLayer — gateway', () => {
    expect(
      classifyImportLayer({
        status: 'matched',
        gateway_auto_matched: true,
        reconciliation_method: 'gateway_deterministic',
      })
    ).toBe('gateway_deterministic');
  });

  it('buildImportMetricsSnapshot — contadores por camada', () => {
    const snap = buildImportMetricsSnapshot(
      [
        { gateway_auto_matched: true, status: 'matched' },
        { suggested_tx_id: 'tx1', match_score: BANK_MATCH_SUGGEST_SCORE, status: 'unmatched' },
        { status: 'unmatched', match_score: 0 },
        { status: 'duplicate' },
      ],
      { pool_tx_count: 10, ai_calls: 0 }
    );
    expect(snap.layers_at_import.gateway_deterministic).toBe(1);
    expect(snap.layers_at_import.score_suggested).toBe(1);
    expect(snap.layers_at_import.no_suggestion).toBe(1);
    expect(snap.layers_at_import.duplicate).toBe(1);
    expect(snap.pool_tx_count).toBe(10);
    expect(snap.ai.calls).toBe(0);
  });

  it('buildMatchConfirmedMetrics — aceita sugestão de score', () => {
    const m = buildMatchConfirmedMetrics(
      { id: 'item-1', suggested_tx_id: 'tx-a', match_score: 85, match_tier: 'amount_date' },
      'tx-a'
    );
    expect(m.accepted_suggestion).toBe(true);
    expect(m.reconciliation_method).toBe('score_manual_accepted');
  });

  it('buildMatchConfirmedMetrics — override manual', () => {
    const m = buildMatchConfirmedMetrics(
      { id: 'item-1', suggested_tx_id: 'tx-a', match_score: 85 },
      'tx-b'
    );
    expect(m.accepted_suggestion).toBe(false);
    expect(m.reconciliation_method).toBe('manual_override');
  });

  it('buildStatementCompletionMetrics — rejection rate e tempo', () => {
    const metrics = buildStatementCompletionMetrics(
      [
        {
          id: 'i1',
          status: 'matched',
          matched_tx_id: 'tx1',
          suggested_tx_id: 'tx1',
          reconciliation_method: 'score_manual_accepted',
        },
        {
          id: 'i2',
          status: 'unmatched',
          suggested_tx_id: 'tx2',
          match_score: 70,
        },
        { id: 'i3', status: 'ignored', suggested_tx_id: 'tx3' },
      ],
      {
        statement_id: 'st-1',
        import_date: '2026-06-01T10:00:00.000Z',
        completed_at: '2026-06-01T14:00:00.000Z',
      }
    );
    expect(metrics.suggestions.shown).toBe(3);
    expect(metrics.suggestions.accepted).toBe(1);
    expect(metrics.suggestions.rejected).toBe(2);
    expect(metrics.suggestions.rejection_rate).toBeCloseTo(2 / 3, 3);
    expect(metrics.timing.time_to_complete_hours).toBe(4);
    expect(metrics.resolution_final.score_manual_accepted).toBe(1);
    expect(metrics.resolution_final.still_unmatched).toBe(1);
  });

  it('buildStaleOrphanScanMetrics — agrega extratos', () => {
    const m = buildStaleOrphanScanMetrics(
      [
        { statement_id: 's1', academy_id: 'a1', stale_unmatched_count: 3 },
        { statement_id: 's2', academy_id: 'a1', stale_unmatched_count: 2 },
      ],
      { staleDays: 7 }
    );
    expect(m.stale_unmatched_items_total).toBe(5);
    expect(m.statements_with_stale_items).toBe(2);
  });
});
