import { describe, expect, it } from 'vitest';
import {
  isFrozenInMonth,
  isStudentFreezeCacheCoveringMonth,
  referenceMonthsInRange,
  isAnnualPlanStudent,
  isSemesterPlanStudent,
  resolveFreezePlanKind,
  canStartPlanFreeze,
  freezeQuotaMaxDays,
  freezeLimitAlertDays,
  freezePeriodDays,
  planCycleStartYmd,
  effectiveFreezeDaysUsed,
  validateFreezeRequest,
  computeReturnYmd,
  planYearStartYmd,
  FREEZE_MAX_DAYS_PER_YEAR,
  FREEZE_MAX_DAYS_SEMESTER,
  FREEZE_LIMIT_ALERT_DAYS_USED,
  projectedFreezeDaysUsed,
  shouldAlertFreezeLimit,
  isFreezeIndefinite,
  minRetroactiveStartYmd,
  freezeDaysRemaining,
} from '../../lib/planFreezeCore.js';

describe('planFreezeCore (validação e cota)', () => {
  it('detects annual plan by name', () => {
    expect(isAnnualPlanStudent({ plan: 'Plano Anual' })).toBe(true);
    expect(isAnnualPlanStudent({ plan: 'Mensal' })).toBe(false);
  });

  it('detects semester plan by name and billing', () => {
    expect(isSemesterPlanStudent({ plan: 'Plano Semestral' })).toBe(true);
    expect(isSemesterPlanStudent({ plan: 'Mensal' })).toBe(false);
    expect(isSemesterPlanStudent({ plan: 'X', plan_billing: 'semestral' })).toBe(true);
    expect(isSemesterPlanStudent({ plan: 'X', plan_billing: 'semiannual' })).toBe(true);
    expect(
      isSemesterPlanStudent(
        { plan: 'Pacote 6m' },
        { plans: [{ name: 'Pacote 6m', billing: 'semestral' }] }
      )
    ).toBe(true);
  });

  it('resolveFreezePlanKind prefers annual over semester naming collision', () => {
    expect(resolveFreezePlanKind({ plan: 'Anual' })).toBe('annual');
    expect(resolveFreezePlanKind({ plan: 'Semestral' })).toBe('semester');
    expect(resolveFreezePlanKind({ plan: 'Mensal' })).toBe(null);
  });

  it('canStartPlanFreeze allows semester with remaining quota', () => {
    const student = { plan: 'Semestral', enrollmentDate: '2026-01-10', freeze_days_used: 0 };
    expect(canStartPlanFreeze(student, null, new Date('2026-05-18T12:00:00'))).toBe(true);
    expect(freezeQuotaMaxDays(student)).toBe(FREEZE_MAX_DAYS_SEMESTER);
    expect(freezePeriodDays(student)).toBe(182);
    expect(freezeLimitAlertDays(student)).toBe(37);
  });

  it('semester cycle uses 182-day periods from enrollment', () => {
    const enroll = '2026-01-10';
    const mid = new Date('2026-05-18T12:00:00');
    expect(planCycleStartYmd(enroll, 182, mid)).toBe('2026-01-10');
    const afterFirst = new Date('2026-08-01T12:00:00');
    // 2026-01-10 + 182 days = 2026-07-11
    expect(planCycleStartYmd(enroll, 182, afterFirst)).toBe('2026-07-11');
  });

  it('validates semester freeze within 45-day quota', () => {
    const today = new Date('2026-05-18T12:00:00');
    const student = {
      plan: 'Semestral',
      enrollmentDate: '2026-01-10',
      freeze_days_used: 0,
      freeze_quota_year: planCycleStartYmd('2026-01-10', 182, today),
    };
    expect(freezeDaysRemaining(student, today)).toBe(45);
    const r = validateFreezeRequest({
      startYmd: '2026-05-18',
      endYmd: computeReturnYmd('2026-05-18', 30),
      durationDays: 30,
      student,
      today,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects semester freeze above 45-day quota', () => {
    const today = new Date('2026-05-18T12:00:00');
    const student = {
      plan: 'Semestral',
      enrollmentDate: '2026-01-10',
      freeze_days_used: 40,
      freeze_quota_year: planCycleStartYmd('2026-01-10', 182, today),
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
    expect(String(r.error || '')).toMatch(/45/);
  });

  it('resets semester used days on new 182-day cycle', () => {
    const student = {
      plan: 'Semestral',
      enrollmentDate: '2026-01-10',
      freeze_days_used: 40,
      freeze_quota_year: '2026-01-10',
    };
    const used = effectiveFreezeDaysUsed(student, new Date('2026-08-01T12:00:00'));
    expect(used).toBe(0);
  });

  it('does not allow freeze for monthly plan', () => {
    expect(canStartPlanFreeze({ plan: 'Mensal', enrollmentDate: '2026-01-01' })).toBe(false);
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
    expect(String(r.error || '')).toMatch(/ciclo do plano/);
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

describe('isFrozenInMonth', () => {
  const boundedFreeze = {
    start_date: '2026-01-15T12:00:00.000Z',
    end_date: '2026-02-10T12:00:00.000Z',
    indefinite: false,
  };

  it('intervalo 15/jan–10/fev toca jan e fev', () => {
    expect(referenceMonthsInRange('2026-01-15', '2026-02-10')).toEqual(['2026-01', '2026-02']);
    expect(isFrozenInMonth([boundedFreeze], '2026-01').frozen).toBe(true);
    expect(isFrozenInMonth([boundedFreeze], '2026-02').frozen).toBe(true);
    expect(isFrozenInMonth([boundedFreeze], '2026-03').frozen).toBe(false);
  });

  it('mês anterior ao start não é frozen', () => {
    expect(isFrozenInMonth([boundedFreeze], '2025-12').frozen).toBe(false);
  });

  it('mês posterior ao end não é frozen', () => {
    expect(isFrozenInMonth([boundedFreeze], '2026-03').frozen).toBe(false);
  });

  it('indefinite cobre meses >= mês de start', () => {
    const indefinite = {
      start_date: '2026-03-01T12:00:00.000Z',
      indefinite: true,
    };
    expect(isFrozenInMonth([indefinite], '2026-02').frozen).toBe(false);
    expect(isFrozenInMonth([indefinite], '2026-03').frozen).toBe(true);
    expect(isFrozenInMonth([indefinite], '2026-12').frozen).toBe(true);
  });

  it('múltiplos freezes: só o vigente conta', () => {
    const old = {
      start_date: '2025-06-01T12:00:00.000Z',
      end_date: '2025-08-31T12:00:00.000Z',
    };
    const current = {
      start_date: '2026-01-15T12:00:00.000Z',
      end_date: '2026-02-10T12:00:00.000Z',
    };
    expect(isFrozenInMonth([old, current], '2026-01').frozen).toBe(true);
    expect(isFrozenInMonth([old, current], '2025-07').frozen).toBe(true);
    expect(isFrozenInMonth([old, current], '2025-10').frozen).toBe(false);
  });

  it('freeze cancelado é ignorado', () => {
    const cancelled = { ...boundedFreeze, status: 'cancelled' };
    expect(isFrozenInMonth([cancelled], '2026-01').frozen).toBe(false);
  });
});

describe('isStudentFreezeCacheCoveringMonth', () => {
  it('cache ativo fora do intervalo não cobre o mês avaliado', () => {
    const student = {
      freeze_status: 'active',
      freeze_start: '2026-04-01T12:00:00.000Z',
      freeze_end: '2026-06-30T12:00:00.000Z',
    };
    expect(isStudentFreezeCacheCoveringMonth(student, '2026-03')).toBe(false);
    expect(isStudentFreezeCacheCoveringMonth(student, '2026-05')).toBe(true);
  });

  it('cache legado sem datas preserva comportamento (frozen)', () => {
    const student = { freeze_status: 'active' };
    expect(isStudentFreezeCacheCoveringMonth(student, '2026-01')).toBe(true);
  });
});
