import { describe, it, expect } from 'vitest';
import {
  monthToYmdRange,
  resolveEnrollmentPeriodRange,
  resolveLeadPeriodRange,
  enrolledContactMatchesPeriod,
} from '../lib/pipelineEnrollmentFilter.js';
import { formatLocalYmd } from '../lib/studentEnrollmentDate.js';

describe('pipelineEnrollmentFilter', () => {
  it('monthToYmdRange cobre o mês inteiro', () => {
    expect(monthToYmdRange('2026-05')).toEqual({ from: '2026-05-01', to: '2026-05-31' });
  });

  it('resolveEnrollmentPeriodRange prioriza enrollmentMonthFilter', () => {
    expect(
      resolveEnrollmentPeriodRange({
        enrollmentMonthFilter: '2024-03',
        filterDateFrom: '2026-01-01',
        filterDateTo: '2026-01-31',
        quickFilter: 'month',
        formatLocalYmd,
      })
    ).toEqual({ from: '2024-03-01', to: '2024-03-31' });
  });

  it('resolveLeadPeriodRange ignora enrollmentMonthFilter', () => {
    const range = resolveLeadPeriodRange({
      filterDateFrom: '2026-06-01',
      filterDateTo: '2026-06-15',
      quickFilter: null,
      formatLocalYmd,
    });
    expect(range).toEqual({ from: '2026-06-01', to: '2026-06-15' });
  });

  it('enrolledContactMatchesPeriod usa data de ingresso, não convertedAt', () => {
    expect(
      enrolledContactMatchesPeriod(
        { enrollmentDate: '2023-08-12', convertedAt: '2026-06-01T00:00:00.000Z' },
        { from: '2026-06-01', to: '2026-06-30' }
      )
    ).toBe(false);
    expect(
      enrolledContactMatchesPeriod(
        { convertedAt: '2026-06-10T00:00:00.000Z' },
        { from: '2026-06-01', to: '2026-06-30' }
      )
    ).toBe(false);
    expect(
      enrolledContactMatchesPeriod(
        { enrollmentDate: '2026-06-10' },
        { from: '2026-06-01', to: '2026-06-30' }
      )
    ).toBe(true);
  });
});
