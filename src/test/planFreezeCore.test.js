import { describe, it, expect } from 'vitest';
import {
  isAnnualPlanStudent,
  effectiveFreezeDaysUsed,
  validateFreezeRequest,
  computeReturnYmd,
  planYearStartYmd,
  FREEZE_MAX_DAYS_PER_YEAR,
  FREEZE_LIMIT_ALERT_DAYS_USED,
  projectedFreezeDaysUsed,
  shouldAlertFreezeLimit,
  isFreezeIndefinite,
  minRetroactiveStartYmd,
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

  it('accepts retroactive start within plan year', () => {
    const today = new Date('2026-05-18T12:00:00');
    const student = { plan: 'Anual', enrollmentDate: '2024-01-15', freeze_days_used: 0 };
    const start = '2026-04-01';
    const end = computeReturnYmd(start, 20);
    const r = validateFreezeRequest({
      startYmd: start,
      endYmd: end,
      durationDays: 20,
      student,
      today,
    });
    expect(r.ok).toBe(true);
    expect(r.startYmd).toBe(start);
  });

  it('rejects start before plan year', () => {
    const today = new Date('2026-05-18T12:00:00');
    const student = { plan: 'Anual', enrollmentDate: '2024-01-15', freeze_days_used: 0 };
    const minStart = minRetroactiveStartYmd(student, today);
    const r = validateFreezeRequest({
      startYmd: '2025-12-01',
      endYmd: computeReturnYmd('2025-12-01', 10),
      durationDays: 10,
      student,
      today,
    });
    expect(r.ok).toBe(false);
    expect(String(r.error || '')).toMatch(/ano do plano/);
    expect(minStart).toBe(planYearStartYmd('2024-01-15', today));
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

  it('accepts indefinite freeze without end date', () => {
    const today = new Date('2026-05-18T12:00:00');
    const student = { plan: 'Anual', enrollmentDate: '2024-01-15', freeze_days_used: 10 };
    const r = validateFreezeRequest({
      startYmd: '2026-05-18',
      student,
      today,
      indefinite: true,
    });
    expect(r.ok).toBe(true);
    expect(r.indefinite).toBe(true);
    expect(r.endYmd).toBeNull();
    expect(r.days).toBeNull();
  });

  it('rejects indefinite when quota exhausted', () => {
    const today = new Date('2026-05-18T12:00:00');
    const student = {
      plan: 'Anual',
      enrollmentDate: '2024-01-15',
      freeze_days_used: 90,
      freeze_quota_year: planYearStartYmd('2024-01-15', today),
    };
    const r = validateFreezeRequest({
      startYmd: '2026-05-18',
      student,
      today,
      indefinite: true,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects retroactive indefinite when elapsed exceeds remaining quota', () => {
    const today = new Date('2026-05-18T12:00:00');
    const student = {
      plan: 'Anual',
      enrollmentDate: '2024-01-15',
      freeze_days_used: 85,
      freeze_quota_year: planYearStartYmd('2024-01-15', today),
    };
    const r = validateFreezeRequest({
      startYmd: '2026-05-14',
      student,
      today,
      indefinite: true,
    });
    expect(r.ok).toBe(false);
    expect(String(r.error || '')).toMatch(/Restam apenas 5/);
  });

  it('projectedFreezeDaysUsed includes indefinite elapsed days', () => {
    const today = new Date('2026-05-18T12:00:00');
    const student = {
      freeze_status: 'active',
      freeze_start: '2026-05-01T12:00:00.000Z',
      freeze_end: null,
      freeze_days_used: 20,
      enrollmentDate: '2024-01-15',
      freeze_quota_year: planYearStartYmd('2024-01-15', today),
    };
    expect(isFreezeIndefinite(student)).toBe(true);
    const projected = projectedFreezeDaysUsed(student, today);
    expect(projected).toBeGreaterThan(20);
    expect(shouldAlertFreezeLimit(student, today)).toBe(projected >= FREEZE_LIMIT_ALERT_DAYS_USED);
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
