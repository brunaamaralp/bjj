/**
 * Trancamento de plano anual — regras compartilhadas (cliente + servidor).
 */

export const FREEZE_MAX_DAYS_PER_YEAR = 90;
export const FREEZE_STATUS_ACTIVE = 'active';
export const MAX_FUTURE_START_DAYS = 7;

/** @param {string|Date|null|undefined} v */
export function parseYmdLocal(v) {
  if (!v) return null;
  const s = String(v).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return new Date(`${iso[1]}T12:00:00`);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00`);
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}

/** @param {Date} d */
export function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** @param {Date} d */
export function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/** Início do dia local. */
export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Dias entre duas datas (inclusive do dia final se end >= start). */
export function daysBetweenInclusive(startYmd, endYmd) {
  const a = startOfDay(parseYmdLocal(startYmd) || new Date());
  const b = startOfDay(parseYmdLocal(endYmd) || new Date());
  const diff = Math.floor((b.getTime() - a.getTime()) / 86400000);
  return Math.max(0, diff + 1);
}

/** Meses YYYY-MM tocados pelo intervalo [startYmd, endYmd]. */
export function referenceMonthsInRange(startYmd, endYmd) {
  const start = parseYmdLocal(startYmd);
  const end = parseYmdLocal(endYmd);
  if (!start || !end || end < start) return [];
  const months = new Set();
  let d = startOfDay(start);
  const end0 = startOfDay(end);
  while (d <= end0) {
    months.add(toYmd(d).slice(0, 7));
    d = addDays(d, 1);
  }
  return [...months].sort();
}

/**
 * Início do ano de plano (aniversário da matrícula) que contém refDate.
 * @param {string} enrollmentYmd
 * @param {Date} [refDate]
 */
export function planYearStartYmd(enrollmentYmd, refDate = new Date()) {
  const enroll = parseYmdLocal(enrollmentYmd);
  if (!enroll) return toYmd(refDate).slice(0, 10);
  const ref = startOfDay(refDate);
  let start = new Date(enroll.getFullYear(), enroll.getMonth(), enroll.getDate(), 12, 0, 0, 0);
  while (addDays(start, 365) <= ref) {
    start = addDays(start, 365);
  }
  while (start > ref) {
    start = addDays(start, -365);
  }
  return toYmd(start);
}

/**
 * Dias de trancamento já usados no ano de plano atual (reseta no aniversário).
 */
export function effectiveFreezeDaysUsed(student, today = new Date()) {
  const raw = Number(student?.freeze_days_used ?? student?.freezeDaysUsed ?? 0);
  const used = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 0;
  const enroll = String(student?.enrollmentDate || student?.enrollment_date || '').trim().slice(0, 10);
  if (!enroll) return used;

  const currentYearStart = planYearStartYmd(enroll, today);
  const storedAnchor = String(student?.freeze_quota_year || student?.freezeQuotaYear || '').trim();
  if (storedAnchor && storedAnchor !== currentYearStart) return 0;
  if (!storedAnchor && used > 0) {
    const freezeStart = String(student?.freeze_start || student?.freezeStart || '').trim().slice(0, 10);
    if (freezeStart && planYearStartYmd(enroll, parseYmdLocal(freezeStart) || today) !== currentYearStart) {
      return 0;
    }
  }
  return used;
}

export function freezeDaysRemaining(student, today = new Date()) {
  return Math.max(0, FREEZE_MAX_DAYS_PER_YEAR - effectiveFreezeDaysUsed(student, today));
}

/**
 * Plano anual: plan_billing === 'annual' ou nome contém "anual".
 * @param {object} student
 * @param {object} [financeConfig]
 */
export function isAnnualPlanStudent(student, financeConfig = null) {
  const billing = String(student?.plan_billing || student?.planBilling || '').trim().toLowerCase();
  if (billing === 'annual' || billing === 'anual') return true;

  const planName = String(student?.plan || '').trim();
  if (/anual/i.test(planName)) return true;

  const plans = financeConfig?.plans || [];
  const match = plans.find((p) => String(p?.name || '').trim() === planName);
  const planBilling = String(match?.billing || match?.plan_billing || '').trim().toLowerCase();
  if (planBilling === 'annual' || planBilling === 'anual') return true;

  return false;
}

export function isFreezeActive(student) {
  return String(student?.freeze_status || student?.freezeStatus || '').trim() === FREEZE_STATUS_ACTIVE;
}

export function canStartPlanFreeze(student, financeConfig = null, today = new Date()) {
  if (!isAnnualPlanStudent(student, financeConfig)) return false;
  if (isFreezeActive(student)) return false;
  if (freezeDaysRemaining(student, today) <= 0) return false;
  return true;
}

/** @param {string} startYmd */
export function maxFreezeDurationDays(student, startYmd, today = new Date()) {
  return freezeDaysRemaining(student, today);
}

export function computeReturnYmd(startYmd, durationDays) {
  const start = parseYmdLocal(startYmd);
  if (!start || durationDays < 1) return '';
  return toYmd(addDays(start, durationDays - 1));
}

export function computeDurationDays(startYmd, endYmd) {
  return daysBetweenInclusive(startYmd, endYmd);
}

/**
 * @param {{ startYmd: string, endYmd: string, durationDays: number, student: object, today?: Date }}
 */
export function validateFreezeRequest({ startYmd, endYmd, durationDays, student, today = new Date() }) {
  const today0 = startOfDay(today);
  const start = parseYmdLocal(startYmd);
  const end = parseYmdLocal(endYmd);
  if (!start || !end) return { ok: false, error: 'Datas inválidas.' };

  const start0 = startOfDay(start);
  const maxStart = addDays(today0, MAX_FUTURE_START_DAYS);
  if (start0 < today0) return { ok: false, error: 'A data de início não pode ser anterior a hoje.' };
  if (start0 > maxStart) {
    return { ok: false, error: `A data de início pode ser no máximo ${MAX_FUTURE_START_DAYS} dias no futuro.` };
  }

  const days = Number(durationDays) || computeDurationDays(startYmd, endYmd);
  if (days < 1) return { ok: false, error: 'Informe uma duração válida.' };

  const remaining = freezeDaysRemaining(student, today);
  if (days > remaining) {
    return {
      ok: false,
      error: `Limite de ${FREEZE_MAX_DAYS_PER_YEAR} dias atingido. Disponível: ${remaining} dias.`,
    };
  }

  const end0 = startOfDay(end);
  const expectedEnd = startOfDay(parseYmdLocal(computeReturnYmd(startYmd, days)) || end);
  if (Math.abs(end0.getTime() - expectedEnd.getTime()) > 86400000) {
    return { ok: false, error: 'A data de retorno não corresponde à duração informada.' };
  }

  return { ok: true, days, startYmd: toYmd(start0), endYmd: toYmd(end0) };
}

export function freezeDaysLeftInPeriod(student, today = new Date()) {
  if (!isFreezeActive(student)) return 0;
  const end = parseYmdLocal(String(student?.freeze_end || student?.freezeEnd || '').slice(0, 10));
  if (!end) return 0;
  const today0 = startOfDay(today);
  const end0 = startOfDay(end);
  if (end0 < today0) return 0;
  return Math.floor((end0.getTime() - today0.getTime()) / 86400000) + 1;
}

/** Meses a adicionar ao bundle após trancamento. */
export function bundleExtensionMonthsFromDays(days) {
  const d = Math.max(0, Number(days) || 0);
  if (d <= 0) return 0;
  return Math.max(1, Math.ceil(d / 30));
}
