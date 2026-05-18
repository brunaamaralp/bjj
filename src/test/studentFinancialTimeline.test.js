import { describe, it, expect } from 'vitest';
import {
  buildFinancialTimelineItems,
  filterTimelineItems,
  buildFinancialSummary,
  countTimelineHistory,
  filterTypeCounts,
} from '../lib/studentFinancialTimeline.js';

describe('studentFinancialTimeline', () => {
  it('buildFinancialTimelineItems inclui plan, bundle e venda', () => {
    const payments = [
      {
        $id: 'p1',
        payment_category: 'plan',
        reference_month: '2026-03',
        status: 'paid',
        amount: 200,
        paid_at: '2026-03-05T12:00:00.000Z',
      },
      {
        $id: 'a1',
        payment_category: 'bundle',
        bundle_origin_id: 'a1',
        bundle_months: 2,
        reference_month: '2026-01',
        status: 'paid',
        amount: 400,
        paid_at: '2026-01-10T12:00:00.000Z',
      },
      {
        $id: 'c1',
        payment_category: 'bundle',
        bundle_origin_id: 'a1',
        reference_month: '2026-02',
        status: 'covered',
        amount: 0,
      },
    ];
    const sales = [
      {
        $id: 's1',
        status: 'concluida',
        total: 50,
        created_at: '2026-02-01T10:00:00.000Z',
        items: [{ display_label: 'Kimono', quantidade: 1, subtotal: 50 }],
      },
    ];
    const items = buildFinancialTimelineItems(payments, sales);
    const kinds = items.map((i) => i.kind).sort();
    expect(kinds).toContain('plan');
    expect(kinds).toContain('bundle');
    expect(kinds).toContain('product');
    expect(items.filter((i) => i.kind === 'bundle')).toHaveLength(1);
  });

  it('filterTimelineItems filtra por tipo', () => {
    const items = [
      { kind: 'plan', sortDate: '2026-03-01T00:00:00.000Z' },
      { kind: 'product', sortDate: '2026-02-01T00:00:00.000Z' },
    ];
    const onlyPlan = filterTimelineItems(items, { typeFilter: 'plan', periodKey: 'all' });
    expect(onlyPlan).toHaveLength(1);
    expect(onlyPlan[0].kind).toBe('plan');
  });

  it('buildFinancialSummary reflete bundle ativo', () => {
    const payments = [
      {
        $id: 'a1',
        payment_category: 'bundle',
        bundle_origin_id: 'a1',
        bundle_months: 3,
        reference_month: '2026-01',
        status: 'paid',
        amount: 300,
      },
      {
        $id: 'c1',
        payment_category: 'bundle',
        bundle_origin_id: 'a1',
        reference_month: '2026-02',
        status: 'covered',
      },
    ];
    const summary = buildFinancialSummary({
      student: { plan: 'Mensal', dueDay: 10 },
      financeConfig: { plans: [{ name: 'Mensal', price: 200 }] },
      payments,
      sales: [],
      paymentStatus: { status: 'paid' },
    });
    expect(summary.isBundle).toBe(true);
    expect(summary.situationTone).toBe('success');
  });

  it('countTimelineHistory e filterTypeCounts', () => {
    const payments = [
      { $id: 'p1', payment_category: 'plan', reference_month: '2026-01', status: 'paid' },
      { $id: 'f1', payment_category: 'fee', reference_month: '2026-01', status: 'paid' },
    ];
    const sales = [{ status: 'concluida' }, { status: 'cancelada' }];
    const counts = countTimelineHistory(payments, sales);
    expect(counts.plans).toBe(1);
    expect(counts.fees).toBe(1);
    expect(counts.products).toBe(1);

    const items = buildFinancialTimelineItems(payments, sales);
    const typeCounts = filterTypeCounts(items);
    expect(typeCounts.plan).toBeGreaterThanOrEqual(1);
  });
});
