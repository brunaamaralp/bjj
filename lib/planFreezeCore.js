/**
 * Trancamento de plano anual/semestral — regras compartilhadas (cliente + servidor).
 */

export const FREEZE_MAX_DAYS_PER_YEAR = 90;
export const FREEZE_MAX_DAYS_SEMESTER = 45;
export const FREEZE_PERIOD_DAYS_ANNUAL = 365;
export const FREEZE_PERIOD_DAYS_SEMESTER = 182;
export const FREEZE_LIMIT_ALERT_DAYS_USED = 75;
export const FREEZE_LIMIT_ALERT_DAYS_SEMESTER = 37;
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
 * Início do ciclo de cota (a partir da matrícula) que contém refDate.
 * @param {string} enrollmentYmd
 * @param {number} periodDays
 * @param {Date} [refDate]
 */
export function planCycleStartYmd(enrollmentYmd, periodDays, refDate = new Date()) {
  const period = Math.max(1, Math.trunc(Number(periodDays) || FREEZE_PERIOD_DAYS_ANNUAL));
  const enroll = parseYmdLocal(enrollmentYmd);
  if (!enroll) return toYmd(refDate).slice(0, 10);
  const ref = startOfDay(refDate);
  let start = new Date(enroll.getFullYear(), enroll.getMonth(), enroll.getDate(), 12, 0, 0, 0);
  while (addDays(start, period) <= ref) {
    start = addDays(start, period);
  }
  while (start > ref) {
    start = addDays(start, -period);
  }
  return toYmd(start);
}

/**
 * Início do ano de plano (aniversário da matrícula) que contém refDate.
 * @param {string} enrollmentYmd
 * @param {Date} [refDate]
 */
export function planYearStartYmd(enrollmentYmd, refDate = new Date()) {
  return planCycleStartYmd(enrollmentYmd, FREEZE_PERIOD_DAYS_ANNUAL, refDate);
}

function catalogPlanBilling(student, financeConfig) {
  const planName = String(student?.plan || '').trim();
  if (!planName) return '';
  const plans = financeConfig?.plans || [];
  const match = plans.find((p) => String(p?.name || '').trim() === planName);
  return String(match?.billing || match?.plan_billing || '').trim().toLowerCase();
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

  const planBilling = catalogPlanBilling(student, financeConfig);
  if (planBilling === 'annual' || planBilling === 'anual') return true;

  return false;
}

/**
 * Plano semestral: plan_billing semestral/semiannual/semester ou nome contém "semestral".
 * @param {object} student
 * @param {object} [financeConfig]
 */
export function isSemesterPlanStudent(student, financeConfig = null) {
  if (isAnnualPlanStudent(student, financeConfig)) return false;

  const billing = String(student?.plan_billing || student?.planBilling || '').trim().toLowerCase();
  if (billing === 'semestral' || billing === 'semiannual' || billing === 'semester') return true;

  const planName = String(student?.plan || '').trim();
  if (/semestral/i.test(planName)) return true;

  const planBilling = catalogPlanBilling(student, financeConfig);
  if (planBilling === 'semestral' || planBilling === 'semiannual' || planBilling === 'semester') {
    return true;
  }

  return false;
}

/**
 * @returns {'annual'|'semester'|null}
 */
export function resolveFreezePlanKind(student, financeConfig = null) {
  if (isAnnualPlanStudent(student, financeConfig)) return 'annual';
  if (isSemesterPlanStudent(student, financeConfig)) return 'semester';
  return null;
}

export function freezePeriodDays(student, financeConfig = null) {
  return resolveFreezePlanKind(student, financeConfig) === 'semester'
    ? FREEZE_PERIOD_DAYS_SEMESTER
    : FREEZE_PERIOD_DAYS_ANNUAL;
}

export function freezeQuotaMaxDays(student, financeConfig = null) {
  const kind = resolveFreezePlanKind(student, financeConfig);
  if (kind === 'semester') return FREEZE_MAX_DAYS_SEMESTER;
  if (kind === 'annual') return FREEZE_MAX_DAYS_PER_YEAR;
  return 0;
}

export function freezeLimitAlertDays(student, financeConfig = null) {
  return resolveFreezePlanKind(student, financeConfig) === 'semester'
    ? FREEZE_LIMIT_ALERT_DAYS_SEMESTER
    : FREEZE_LIMIT_ALERT_DAYS_USED;
}

/** Âncora do ciclo de cota vigente para o aluno. */
export function studentFreezeCycleStartYmd(student, financeConfig = null, today = new Date()) {
  const enroll = String(student?.enrollmentDate || student?.enrollment_date || '').trim().slice(0, 10);
  const period = freezePeriodDays(student, financeConfig);
  return planCycleStartYmd(enroll || toYmd(today), period, today);
}

/**
 * Dias de trancamento já usados no ciclo de cota atual (reseta no início do ciclo).
 */
export function effectiveFreezeDaysUsed(student, today = new Date(), financeConfig = null) {
  const raw = Number(student?.freeze_days_used ?? student?.freezeDaysUsed ?? 0);
  const used = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 0;
  const enroll = String(student?.enrollmentDate || student?.enrollment_date || '').trim().slice(0, 10);
  if (!enroll) return used;

  const period = freezePeriodDays(student, financeConfig);
  const currentCycleStart = planCycleStartYmd(enroll, period, today);
  const storedAnchor = String(student?.freeze_quota_year || student?.freezeQuotaYear || '').trim();
  if (storedAnchor && storedAnchor !== currentCycleStart) return 0;
  if (!storedAnchor && used > 0) {
    const freezeStart = String(student?.freeze_start || student?.freezeStart || '').trim().slice(0, 10);
    if (
      freezeStart &&
      planCycleStartYmd(enroll, period, parseYmdLocal(freezeStart) || today) !== currentCycleStart
    ) {
      return 0;
    }
  }
  return used;
}

export function freezeDaysRemaining(student, today = new Date(), financeConfig = null) {
  const max = freezeQuotaMaxDays(student, financeConfig);
  if (max <= 0) return 0;
  return Math.max(0, max - effectiveFreezeDaysUsed(student, today, financeConfig));
}

export function isFreezeActive(student) {
  return String(student?.freeze_status || student?.freezeStatus || '').trim() === FREEZE_STATUS_ACTIVE;
}

function isFreezeRecordCancelled(freeze) {
  const status = String(freeze?.status || '').trim().toLowerCase();
  return status === 'cancelled' || status === 'canceled';
}

/**
 * Verifica se algum freeze cobre o mês de referência.
 * @param {Array} freezes - documentos de plan_freezes do aluno
 * @param {string} referenceMonth - 'YYYY-MM'
 * @returns {{ frozen: boolean, freeze: object|null }}
 */
export function isFrozenInMonth(freezes, referenceMonth) {
  const ym = String(referenceMonth || '').trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) return { frozen: false, freeze: null };

  for (const freeze of Array.isArray(freezes) ? freezes : []) {
    if (!freeze || isFreezeRecordCancelled(freeze)) continue;

    const startYmd = String(freeze.start_date || freeze.startDate || '').trim().slice(0, 10);
    if (!startYmd) continue;

    const indefinite = freeze.indefinite === true || freeze.indefinite === 'true';
    if (indefinite) {
      const startMonth = startYmd.slice(0, 7);
      if (ym >= startMonth) return { frozen: true, freeze };
      continue;
    }

    const endYmd = String(freeze.end_date || freeze.endDate || '').trim().slice(0, 10);
    if (!endYmd) continue;

    const months = referenceMonthsInRange(startYmd, endYmd);
    if (months.includes(ym)) return { frozen: true, freeze };
  }

  return { frozen: false, freeze: null };
}

/**
 * Fallback estreito: cache global freeze_status só cobre meses dentro do intervalo cacheado.
 * @param {object} student
 * @param {string} referenceMonth - YYYY-MM
 * @param {{ onLegacyNoDates?: (student: object) => void }} [opts]
 */
export function isStudentFreezeCacheCoveringMonth(student, referenceMonth, opts = {}) {
  if (!isFreezeActive(student)) return false;

  const ym = String(referenceMonth || '').trim();
  const startYmd = String(student?.freeze_start || student?.freezeStart || '').trim().slice(0, 10);
  const endYmd = String(student?.freeze_end || student?.freezeEnd || '').trim().slice(0, 10);

  if (!startYmd && !endYmd) {
    if (typeof opts.onLegacyNoDates === 'function') opts.onLegacyNoDates(student);
    return true;
  }

  if (!startYmd) return false;

  if (!endYmd) {
    const startMonth = startYmd.slice(0, 7);
    return ym >= startMonth;
  }

  return referenceMonthsInRange(startYmd, endYmd).includes(ym);
}

export function canStartPlanFreeze(student, financeConfig = null, today = new Date()) {
  if (!resolveFreezePlanKind(student, financeConfig)) return false;
  if (isFreezeActive(student)) return false;
  if (freezeDaysRemaining(student, today, financeConfig) <= 0) return false;
  return true;
}

/** @param {string} startYmd */
export function maxFreezeDurationDays(student, startYmd, today = new Date(), financeConfig = null) {
  return freezeDaysRemaining(student, today, financeConfig);
}

export function computeReturnYmd(startYmd, durationDays) {
  const start = parseYmdLocal(startYmd);
  if (!start || durationDays < 1) return '';
  return toYmd(addDays(start, durationDays - 1));
}

export function computeDurationDays(startYmd, endYmd) {
  return daysBetweenInclusive(startYmd, endYmd);
}

export function isFreezeIndefinite(student) {
  if (!isFreezeActive(student)) return false;
  const end = String(student?.freeze_end || student?.freezeEnd || '').trim().slice(0, 10);
  return !end;
}

/** Data mínima de início retroativo (início do ciclo de cota atual). */
export function minRetroactiveStartYmd(student, today = new Date(), financeConfig = null) {
  return studentFreezeCycleStartYmd(student, financeConfig, today);
}

/** Dias decorridos do trancamento ativo (inclusive hoje). */
export function activeFreezeElapsedDays(student, today = new Date()) {
  if (!isFreezeActive(student)) return 0;
  const startYmd = String(student?.freeze_start || student?.freezeStart || '').trim().slice(0, 10);
  if (!startYmd) return 0;
  return computeDurationDays(startYmd, toYmd(today));
}

/**
 * Projeção de dias usados no ciclo de cota (inclui trancamento indefinido em andamento).
 */
export function projectedFreezeDaysUsed(student, today = new Date(), financeConfig = null) {
  const base = effectiveFreezeDaysUsed(student, today, financeConfig);
  if (!isFreezeActive(student)) return base;
  if (isFreezeIndefinite(student)) {
    return base + activeFreezeElapsedDays(student, today);
  }
  return base;
}

export function shouldAlertFreezeLimit(student, today = new Date(), financeConfig = null) {
  return projectedFreezeDaysUsed(student, today, financeConfig) >= freezeLimitAlertDays(student, financeConfig);
}

/** Fim do intervalo para congelar pagamentos. */
export function paymentFreezeEndYmd({ startYmd, endYmd, indefinite, today = new Date() }) {
  if (indefinite) return toYmd(today);
  return String(endYmd || '').trim().slice(0, 10);
}

function validateStartYmd({ startYmd, student, today, financeConfig }) {
  const today0 = startOfDay(today);
  const start = parseYmdLocal(startYmd);
  if (!start) return { ok: false, error: 'Data de início inválida.' };

  const start0 = startOfDay(start);
  const minStart = startOfDay(parseYmdLocal(minRetroactiveStartYmd(student, today, financeConfig)) || today);
  const maxStart = addDays(today0, MAX_FUTURE_START_DAYS);

  if (start0 < minStart) {
    return {
      ok: false,
      error: `A data de início não pode ser anterior ao início do ciclo do plano (${toYmd(minStart)}).`,
    };
  }
  if (start0 > maxStart) {
    return { ok: false, error: `A data de início pode ser no máximo ${MAX_FUTURE_START_DAYS} dias no futuro.` };
  }

  return { ok: true, start0, startYmd: toYmd(start0) };
}

/**
 * @param {{ startYmd: string, endYmd?: string, durationDays?: number, student: object, today?: Date, indefinite?: boolean, financeConfig?: object }}
 */
export function validateFreezeRequest({
  startYmd,
  endYmd,
  durationDays,
  student,
  today = new Date(),
  indefinite = false,
  financeConfig = null,
}) {
  const startCheck = validateStartYmd({ startYmd, student, today, financeConfig });
  if (!startCheck.ok) return startCheck;

  const { startYmd: sYmd } = startCheck;
  const remaining = freezeDaysRemaining(student, today, financeConfig);
  const maxDays = freezeQuotaMaxDays(student, financeConfig) || FREEZE_MAX_DAYS_PER_YEAR;

  if (indefinite) {
    if (remaining <= 0) {
      return {
        ok: false,
        error: `Limite de ${maxDays} dias atingido. Disponível: 0 dias.`,
      };
    }
    const elapsed = computeDurationDays(sYmd, toYmd(today));
    const baseUsed = effectiveFreezeDaysUsed(student, today, financeConfig);
    if (baseUsed + elapsed > maxDays) {
      return {
        ok: false,
        error: `Com esta data de início, o total seria ${baseUsed + elapsed} dias (limite ${maxDays}).`,
      };
    }
    if (elapsed >= remaining) {
      return {
        ok: false,
        error: `Restam apenas ${remaining} dias na cota. Ajuste a data de início ou encerre trancamentos anteriores.`,
      };
    }
    return { ok: true, indefinite: true, days: null, startYmd: sYmd, endYmd: null };
  }

  const end = parseYmdLocal(endYmd);
  if (!end) return { ok: false, error: 'Informe a data de retorno ou marque retorno indefinido.' };

  const days = Number(durationDays) || computeDurationDays(sYmd, endYmd);
  if (days < 1) return { ok: false, error: 'Informe uma duração válida.' };

  if (days > remaining) {
    return {
      ok: false,
      error: `Limite de ${maxDays} dias atingido. Disponível: ${remaining} dias.`,
    };
  }

  const end0 = startOfDay(end);
  const expectedEnd = startOfDay(parseYmdLocal(computeReturnYmd(sYmd, days)) || end);
  if (Math.abs(end0.getTime() - expectedEnd.getTime()) > 86400000) {
    return { ok: false, error: 'A data de retorno não corresponde à duração informada.' };
  }

  return { ok: true, indefinite: false, days, startYmd: sYmd, endYmd: toYmd(end0) };
}

export function freezeDaysLeftInPeriod(student, today = new Date(), financeConfig = null) {
  if (!isFreezeActive(student)) return 0;
  const maxDays = freezeQuotaMaxDays(student, financeConfig) || FREEZE_MAX_DAYS_PER_YEAR;
  if (isFreezeIndefinite(student)) {
    return Math.max(0, maxDays - projectedFreezeDaysUsed(student, today, financeConfig));
  }
  const end = parseYmdLocal(String(student?.freeze_end || student?.freezeEnd || '').slice(0, 10));
  if (!end) return 0;
  const today0 = startOfDay(today);
  const end0 = startOfDay(end);
  if (end0 < today0) return 0;
  return Math.floor((end0.getTime() - today0.getTime()) / 86400000) + 1;
}

export const FREEZE_LIMIT_ALERT_MARKER = '[freeze_limit_alert]';

export function buildFreezeLimitAlertDescription(freezeStartYmd) {
  return `${FREEZE_LIMIT_ALERT_MARKER}\nfreeze_start: ${String(freezeStartYmd || '').trim().slice(0, 10)}`;
}

/** Meses a adicionar ao bundle após trancamento. */
export function bundleExtensionMonthsFromDays(days) {
  const d = Math.max(0, Number(days) || 0);
  if (d <= 0) return 0;
  return Math.max(1, Math.ceil(d / 30));
}
