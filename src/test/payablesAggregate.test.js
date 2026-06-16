import { describe, expect, it } from 'vitest';
import {
  buildPendingPayableItems,
  buildProjectedPayableItems,
  buildTemplatePayableItems,
  classifyPayableStatus,
  mergePayableItems,
  PAYABLE_SOURCE,
  summarizePayables,
  txPayableDueYmd,
} from '../lib/payablesAggregate.js';

describe('payablesAggregate', () => {
  it('includes pending outflow only', () => {
    const items = buildPendingPayableItems([
      { id: '1', status: 'pending', direction: 'out', gross: 100, planName: 'CPFL', category: 'Luz / energia' },
      { id: '2', status: 'pending', direction: 'in', gross: 50, planName: 'Aluno' },
      { id: '3', status: 'settled', direction: 'out', gross: 80 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].vendor_label).toBe('CPFL');
    expect(items[0].amount).toBe(100);
  });

  it('uses due_date when present', () => {
    expect(txPayableDueYmd({ due_date: '2026-06-10', competence_month: '2026-05' })).toBe('2026-06-10');
    expect(txPayableDueYmd({ competence_month: '2026-05' })).toBe('2026-05-28');
  });

  it('classifies overdue and due_soon', () => {
    expect(classifyPayableStatus('2026-06-01', '2026-06-16')).toBe('overdue');
    expect(classifyPayableStatus('2026-06-20', '2026-06-16')).toBe('due_soon');
    expect(classifyPayableStatus('2026-07-01', '2026-06-16')).toBe('open');
  });

  it('dedupes projected recurrence when pending instance exists', () => {
    const templates = [
      {
        id: 'tpl-1',
        is_recurrence_template: true,
        direction: 'out',
        recurrence_type: 'monthly',
        recurrence_day: 10,
        gross: 450,
        planName: 'CPFL',
        category: 'Luz / energia',
      },
    ];
    const pending = [
      {
        id: 'p1',
        status: 'pending',
        direction: 'out',
        gross: 450,
        recurrence_origin_id: 'tpl-1',
        competence_month: '2026-06',
        due_date: '2026-06-10',
      },
    ];
    const projected = buildProjectedPayableItems(
      templates,
      '2026-06-01',
      '2026-06-30',
      pending,
      { today: '2026-06-01' }
    );
    expect(projected.some((it) => it.due_date === '2026-06-10')).toBe(false);
  });

  it('summarizes open totals', () => {
    const items = mergePayableItems(
      buildPendingPayableItems([
        {
          id: '1',
          status: 'pending',
          direction: 'out',
          gross: 100,
          due_date: '2026-06-01',
          planName: 'A',
        },
        {
          id: '2',
          status: 'pending',
          direction: 'out',
          gross: 50,
          due_date: '2026-06-20',
          planName: 'B',
        },
      ], { today: '2026-06-16' })
    );
    const summary = summarizePayables(items, { today: '2026-06-16' });
    expect(summary.totalOpen).toBe(150);
    expect(summary.overdueCount).toBe(1);
    expect(summary.dueSoonCount).toBe(1);
  });

  it('builds template rows', () => {
    const items = buildTemplatePayableItems(
      [
        {
          id: 'tpl-1',
          is_recurrence_template: true,
          direction: 'out',
          recurrence_type: 'monthly',
          recurrence_day: 10,
          gross: 120,
          planName: 'Sabesp',
          category: 'Água e esgoto',
        },
      ],
      { today: '2026-06-16', pending: [] }
    );
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe(PAYABLE_SOURCE.TEMPLATE);
    expect(items[0].vendor_label).toBe('Sabesp');
  });
});
