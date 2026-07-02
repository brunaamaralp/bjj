/**
 * Meta semanal de check-ins por plano/turma e classificação em 3 níveis.
 * Compartilhado entre cliente e servidor — sem I/O.
 */
import { getConfiguredPlans } from '../src/lib/academyPlans.js';
import { addDays, startOfDay, toYmd } from './planFreezeCore.js';

export const DEFAULT_WEEKLY_CHECKINS_EXPECTED = 2;

export const WEEKLY_RETENTION_WINDOW_DAYS = 7;

/** Regras quando o aluno não atinge a meta na janela rolante de 7 dias. */
export const DEFAULT_WEEKLY_RETENTION_RULES = {
  defaultWeeklyExpected: DEFAULT_WEEKLY_CHECKINS_EXPECTED,
  graceDaysWithoutCheckin: 7,
  atRiskMinDaysWithoutCheckin: 8,
  absentMinDaysWithoutCheckin: 15,
};

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeWeeklyCheckinsExpected(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(7, Math.max(1, Math.round(n)));
}

/**
 * @param {object|null|undefined} financeConfig
 * @param {object[]} [classes]
 */
export function buildWeeklyGoalsContext(financeConfig, classes = []) {
  const plansByName = new Map();
  for (const plan of getConfiguredPlans(financeConfig)) {
    plansByName.set(plan.name.toLowerCase(), plan);
  }

  const classesByTurma = new Map();
  for (const cls of classes || []) {
    if (cls?.is_active === false) continue;
    const name = String(cls.name || '').trim();
    if (name) classesByTurma.set(name.toLowerCase(), cls);
  }

  return { plansByName, classesByTurma };
}

/**
 * Plano do aluno → turma → padrão da academia (2/semana).
 * @param {object|null|undefined} student
 * @param {{ plansByName?: Map<string, object>; classesByTurma?: Map<string, object> }|null} [goalsContext]
 * @param {number} [fallback]
 */
export function resolveWeeklyCheckinsExpected(
  student,
  goalsContext = null,
  fallback = DEFAULT_WEEKLY_CHECKINS_EXPECTED
) {
  const planName = String(student?.plan || student?.plan_name || student?.planName || '').trim();
  if (planName && goalsContext?.plansByName) {
    const plan = goalsContext.plansByName.get(planName.toLowerCase());
    const fromPlan = normalizeWeeklyCheckinsExpected(plan?.weeklyCheckinsExpected);
    if (fromPlan != null) return fromPlan;
  }

  const turma = String(student?.turma || student?.className || student?.class_name || '').trim();
  if (turma && goalsContext?.classesByTurma) {
    const cls = goalsContext.classesByTurma.get(turma.toLowerCase());
    const fromClass = normalizeWeeklyCheckinsExpected(
      cls?.weeklyCheckinsExpected ?? cls?.weekly_checkins_expected
    );
    if (fromClass != null) return fromClass;
  }

  return normalizeWeeklyCheckinsExpected(fallback) ?? DEFAULT_WEEKLY_CHECKINS_EXPECTED;
}

/**
 * Conta check-ins por aluno na janela rolante (inclui hoje).
 * @param {object[]} docs
 * @param {number} [windowDays]
 * @param {Date} [today]
 * @returns {Map<string, number>}
 */
export function aggregateCheckinsInWindowByStudent(docs, windowDays = WEEKLY_RETENTION_WINDOW_DAYS, today = new Date()) {
  const days = Math.max(1, Number(windowDays) || WEEKLY_RETENTION_WINDOW_DAYS);
  const cutoffYmd = toYmd(addDays(startOfDay(today), -(days - 1)));
  const map = new Map();

  for (const row of docs || []) {
    const sid = String(row.student_id || row.lead_id || '').trim();
    const at = String(row.checked_in_at || '').trim();
    if (!sid || !at) continue;
    const ymd = at.slice(0, 10);
    if (!ymd || ymd < cutoffYmd) continue;
    map.set(sid, (map.get(sid) || 0) + 1);
  }

  return map;
}

/**
 * @param {number} checkinsLast7Days
 * @param {number|null|undefined} daysWithoutCheckin
 * @param {number} weeklyExpected
 * @param {typeof DEFAULT_WEEKLY_RETENTION_RULES} [rules]
 * @returns {'active'|'at_risk'|'absent'}
 */
export function classifyWeeklyAttendanceRisk({
  checkinsLast7Days,
  daysWithoutCheckin,
  weeklyExpected,
  rules = DEFAULT_WEEKLY_RETENTION_RULES,
}) {
  const expected =
    normalizeWeeklyCheckinsExpected(weeklyExpected) ??
    normalizeWeeklyCheckinsExpected(rules.defaultWeeklyExpected) ??
    DEFAULT_WEEKLY_CHECKINS_EXPECTED;
  const count = Math.max(0, Number(checkinsLast7Days) || 0);
  const days = daysWithoutCheckin;

  if (count >= expected) return 'active';
  if (count > 0) return 'at_risk';

  if (days == null || !Number.isFinite(days) || days < 0) return 'active';
  if (days <= rules.graceDaysWithoutCheckin) return 'active';
  if (days >= rules.absentMinDaysWithoutCheckin) return 'absent';
  if (days >= rules.atRiskMinDaysWithoutCheckin) return 'at_risk';

  return 'active';
}
