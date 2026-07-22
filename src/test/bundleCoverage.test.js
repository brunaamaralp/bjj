import { describe, it, expect } from 'vitest';
import {
  buildCoverageMonthSpecs,
  buildHistoricalCoverageMonthSpecs,
  previewHistoricalCoverage,
  resolveBundleMonthAction,
  groupStudentPaymentsForProfile,
  listCancellableCoveredMonths,
  buildPaidBundleCoveredMonthsByLead,
  isMonthCoveredByPaidBundle,
  HISTORICAL_COVERED_REASON,
  isHistoricalCoveragePayment,
} from '../lib/bundleCoverage.js';

describe('bundleCoverage', () => {
  it('buildCoverageMonthSpecs gera paid + covered', () => {
    const specs = buildCoverageMonthSpecs({
      startYm: '2026-05',
      bundleMonths: 3,
      totalAmount: 900,
      base: { paid_at: '2026-05-10T12:00:00.000Z', note: '' },
    });
    expect(specs).toHaveLength(3);
    expect(specs[0].status).toBe('paid');
    expect(specs[0].amount).toBe(900);
    expect(specs[1].status).toBe('covered');
    expect(specs[2].reference_month).toBe('2026-07');
    expect(specs[1].amount).toBe(300);
  });

  it('resolveBundleMonthAction respeita paid/partial', () => {
    expect(resolveBundleMonthAction(null)).toBe('create');
    expect(resolveBundleMonthAction({ status: 'paid' })).toBe('skip');
    expect(resolveBundleMonthAction({ status: 'partial' })).toBe('skip');
    expect(resolveBundleMonthAction({ status: 'pending' })).toBe('upsert');
    expect(resolveBundleMonthAction({ status: 'covered' })).toBe('upsert');
  });

  it('groupStudentPaymentsForProfile agrupa bundle', () => {
    const anchor = {
      $id: 'a1',
      payment_category: 'bundle',
      bundle_origin_id: 'a1',
      bundle_months: 12,
      reference_month: '2026-01',
      amount: 2400,
      status: 'paid',
    };
    const child = {
      $id: 'c1',
      payment_category: 'bundle',
      bundle_origin_id: 'a1',
      reference_month: '2026-02',
      status: 'covered',
    };
    const plan = { $id: 'p1', payment_category: 'plan', reference_month: '2025-12', status: 'paid' };
    const { groups } = groupStudentPaymentsForProfile([child, anchor, plan]);
    expect(groups.some((g) => g.type === 'bundle')).toBe(true);
    expect(groups.filter((g) => g.type === 'single')).toHaveLength(1);
  });

  it('buildHistoricalCoverageMonthSpecs: todos covered, amount 0', () => {
    const specs = buildHistoricalCoverageMonthSpecs({
      startYm: '2026-01',
      bundleMonths: 12,
      note: 'pago em 2025',
    });
    expect(specs).toHaveLength(12);
    expect(specs.every((s) => s.status === 'covered')).toBe(true);
    expect(specs.every((s) => s.amount === 0)).toBe(true);
    expect(specs.every((s) => s.covered_reason === HISTORICAL_COVERED_REASON)).toBe(true);
    expect(specs[0].note).toContain('pago em 2025');
    expect(buildHistoricalCoverageMonthSpecs({ startYm: '2026-01', bundleMonths: 0 })).toEqual([]);
    expect(buildHistoricalCoverageMonthSpecs({ startYm: '2026-01', bundleMonths: 25 })).toEqual([]);
  });

  it('previewHistoricalCoverage conta skips de paid/partial', () => {
    const specs = buildHistoricalCoverageMonthSpecs({ startYm: '2026-01', bundleMonths: 3 });
    const existingByMonth = new Map([
      ['2026-01', { status: 'paid' }],
      ['2026-02', { status: 'pending' }],
    ]);
    const preview = previewHistoricalCoverage({ specs, existingByMonth });
    expect(preview.monthsSkipped).toBe(1);
    expect(preview.monthsToWrite).toBe(2);
    expect(preview.total).toBe(3);
  });

  it('isHistoricalCoveragePayment', () => {
    expect(isHistoricalCoveragePayment({ covered_reason: 'historical' })).toBe(true);
    expect(isHistoricalCoveragePayment({ covered_reason: 'freeze' })).toBe(false);
  });

  it('buildPaidBundleCoveredMonthsByLead inclui pacote pago e histórico', () => {
    const byLead = buildPaidBundleCoveredMonthsByLead([
      {
        $id: 'a1',
        lead_id: 'L1',
        payment_category: 'bundle',
        bundle_origin_id: 'a1',
        bundle_months: 3,
        reference_month: '2026-01',
        status: 'paid',
      },
      {
        $id: 'h1',
        lead_id: 'L2',
        payment_category: 'bundle',
        bundle_origin_id: 'h1',
        bundle_months: 12,
        reference_month: '2026-03',
        status: 'covered',
        covered_reason: 'historical',
      },
    ]);
    expect(isMonthCoveredByPaidBundle('2026-02', byLead.get('L1'))).toBe(true);
    expect(isMonthCoveredByPaidBundle('2026-04', byLead.get('L1'))).toBe(false);
    expect(isMonthCoveredByPaidBundle('2026-07', byLead.get('L2'))).toBe(true);
    expect(isMonthCoveredByPaidBundle('2027-03', byLead.get('L2'))).toBe(false);
  });

  it('listCancellableCoveredMonths filtra futuros', () => {
    const payments = [
      { $id: '1', status: 'covered', bundle_origin_id: 'a', reference_month: '2026-06' },
      { $id: '2', status: 'covered', bundle_origin_id: 'a', reference_month: '2026-04' },
      { $id: '3', status: 'paid', bundle_origin_id: 'a', reference_month: '2026-05' },
    ];
    const out = listCancellableCoveredMonths('a', payments, '2026-05');
    expect(out).toHaveLength(1);
    expect(out[0].reference_month).toBe('2026-06');
  });
});
