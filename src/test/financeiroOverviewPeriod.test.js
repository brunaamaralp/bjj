import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  overviewPeriodContext,
  formatPeriodRangeBr,
  buildMovimentacoesPeriodPath,
  monthPeriodBounds,
} from '../lib/financeiroOverview.js';

describe('overviewPeriodContext', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses month bounds with asOf = to for current month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T15:00:00-03:00'));

    const ctx = overviewPeriodContext('2026-07');
    expect(ctx.from).toBe('2026-07-01');
    expect(ctx.to).toBe('2026-07-15');
    expect(ctx.asOf).toBe('2026-07-15');
    expect(ctx.isCurrentMonth).toBe(true);
    expect(ctx.labelFromToBr).toContain('(até hoje)');
  });

  it('uses full month for past reference month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T15:00:00-03:00'));

    const ctx = overviewPeriodContext('2026-06');
    expect(ctx.from).toBe('2026-06-01');
    expect(ctx.to).toBe('2026-06-30');
    expect(ctx.asOf).toBe('2026-06-30');
    expect(ctx.isCurrentMonth).toBe(false);
  });
});

describe('formatPeriodRangeBr', () => {
  it('formats range with até hoje suffix', () => {
    expect(formatPeriodRangeBr('2026-07-01', '2026-07-15', true)).toBe(
      '01/07/2026 – 15/07/2026 (até hoje)'
    );
  });

  it('formats closed month range', () => {
    expect(formatPeriodRangeBr('2026-06-01', '2026-06-30', false)).toBe(
      '01/06/2026 – 30/06/2026'
    );
  });
});

describe('buildMovimentacoesPeriodPath', () => {
  it('includes tab, from, to and conta', () => {
    const path = buildMovimentacoesPeriodPath({
      from: '2026-07-01',
      to: '2026-07-15',
      conta: 'Nubank · 1',
    });
    expect(path).toContain('tab=movimentacoes');
    expect(path).toContain('from=2026-07-01');
    expect(path).toContain('to=2026-07-15');
    expect(path).toContain('conta=');
  });
});

describe('monthPeriodBounds SP alignment', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('caps to today in São Paulo timezone for current month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T03:00:00Z'));

    const { from, to } = monthPeriodBounds('2026-07');
    expect(from).toBe('2026-07-01');
    expect(to).toBe('2026-07-01');
  });

  it('uses month end for past months', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T15:00:00-03:00'));

    const { from, to } = monthPeriodBounds('2026-06');
    expect(from).toBe('2026-06-01');
    expect(to).toBe('2026-06-30');
  });
});
