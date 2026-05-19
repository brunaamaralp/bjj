import { describe, it, expect } from 'vitest';
import {
  isAnnualPlanStudent,
  effectiveFreezeDaysUsed,
  validateFreezeRequest,
  computeReturnYmd,
  planYearStartYmd,
  FREEZE_MAX_DAYS_PER_YEAR,
} from '../../lib/planFreezeCore.js';

describe('planFreezeCore', () => {
  it('detects annual plan by name', () => {
    expect(isAnnualPlanStudent({ plan: 'Plano Anual' })).toBe(true);
    expect(isAnnualPlanStudent({ plan: 'Mensal' })).toBe(false);
  });

  it('validates duration within quota', () => {
    const student = { plan: 'Anual', enrollmentDate: '2024-01-15', freeze_days_used: 0 };
    const start = '2026-05-18';
    const end = computeReturnYmd(start, 30);
    const r = validateFreezeRequest({
      startYmd: start,
      endYmd: end,
      durationDays: 30,
      student,
      today: new Date('2026-05-18T12:00:00'),
    });
    expect(r.ok).toBe(true);
    expect(r.days).toBe(30);
  });

  it('rejects when exceeding 90 days quota', () => {
    const today = new Date('2026-05-18T12:00:00');
    const student = {
      plan: 'Anual',
      enrollmentDate: '2024-01-15',
      freeze_days_used: 85,
      freeze_quota_year: planYearStartYmd('2024-01-15', today),
    };
    const r = validateFreezeRequest({
      startYmd: '2026-05-18',
      endYmd: computeReturnYmd('2026-05-18', 10),
      durationDays: 10,
      student,
      today,
    });
    expect(r.ok).toBe(false);
    expect(String(r.error || '')).toMatch(/Disponível: 5/);
  });

  it('resets used days on new plan year', () => {
    const student = {
      enrollmentDate: '2024-03-01',
      freeze_days_used: 60,
      freeze_quota_year: '2024-03-01',
    };
    const used = effectiveFreezeDaysUsed(student, new Date('2026-04-01T12:00:00'));
    expect(used).toBe(0);
  });
});
