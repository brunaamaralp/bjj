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

/** Valores canônicos de ciclo para catálogo / students.plan_billing. */
export const PLAN_BILLING = Object.freeze({
  ANNUAL: 'annual',
  SEMESTER: 'semestral',
  MONTHLY: 'monthly',
});

/**
 * Normaliza ciclo de plano (catálogo ou aluno).
 * @param {unknown} raw
 * @returns {''|'annual'|'semestral'|'monthly'}
 */
export function normalizePlanBilling(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  if (v === 'annual' || v === 'anual' || v === 'yearly' || v === 'year') return PLAN_BILLING.ANNUAL;
  if (v === 'semestral' || v === 'semiannual' || v === 'semester' || v === 'semi') {
    return PLAN_BILLING.SEMESTER;
  }
  if (v === 'monthly' || v === 'mensal' || v === 'month' || v === 'mês' || v === 'mes') {
    return PLAN_BILLING.MONTHLY;
  }
  return '';
}

/**
 * Infere ciclo pelo nome do plano (heurística).
 * @param {string} planName
 * @returns {''|'annual'|'semestral'|'monthly'}
 */
export function inferPlanBillingFromName(planName) {
  const name = String(planName || '').trim();
  if (!name) return '';
  if (/anual|annual|yearly|12\s*meses?|\bano\b/i.test(name)) return PLAN_BILLING.ANNUAL;
  if (/semestral|semiannual|semester|6\s*meses?/i.test(name)) return PLAN_BILLING.SEMESTER;
  if (/mensal|monthly|1\s*m[eê]s\b/i.test(name)) return PLAN_BILLING.MONTHLY;
  return '';
}

/**
 * Ciclo do plano no catálogo financeiro (match case-insensitive).
 * @param {object} student
 * @param {object} [financeConfig]
 * @returns {''|'annual'|'semestral'|'monthly'}
 */
export function catalogPlanBilling(student, financeConfig) {
  const planName = String(student?.plan || '').trim();
  if (!planName || !financeConfig) return '';
  const key = planName.toLowerCase();
  const plans = financeConfig?.plans || [];
  const match = plans.find((p) => String(p?.name || '').trim().toLowerCase() === key);
  if (!match) return '';
  const fromField = normalizePlanBilling(match.billing || match.plan_billing || match.planBilling);
  if (fromField) return fromField;
  return inferPlanBillingFromName(match.name);
}

/**
 * Resolve ciclo efetivo do aluno (atributo → catálogo → nome).
 * @param {object} student
 * @param {object} [financeConfig]
 * @returns {''|'annual'|'semestral'|'monthly'}
 */
export function resolveStudentPlanBilling(student, financeConfig = null) {
  const fromStudent = normalizePlanBilling(student?.plan_billing || student?.planBilling);
  if (fromStudent) return fromStudent;
  const fromCatalog = catalogPlanBilling(student, financeConfig);
  if (fromCatalog) return fromCatalog;
  return inferPlanBillingFromName(student?.plan);
}

/**
 * Snapshot de plan_billing a gravar no aluno ao escolher um plano do catálogo.
 * @param {object} [financeConfig]
 * @param {string} planName
 * @returns {string|null} annual|semestral|monthly ou null se indefinido
 */
export function snapshotPlanBillingFromCatalog(financeConfig, planName) {
  const name = String(planName || '').trim();
  if (!name) return null;
  const resolved = resolveStudentPlanBilling({ plan: name }, financeConfig);
  return resolved || null;
}

/**
 * Infere ciclo a partir de pacote (bundle) pago — 12→anual, 6→semestral.
 * @param {Array|null|undefined} payments
 * @returns {''|'annual'|'semestral'}
 */
export function inferFreezeBillingFromPayments(payments) {
  let bestMonths = 0;
  for (const p of Array.isArray(payments) ? payments : []) {
    if (!p) continue;
    const cat = String(p.payment_category || p.paymentCategory || '').trim().toLowerCase();
    if (cat && cat !== 'bundle') continue;
    const status = String(p.status || '').trim().toLowerCase();
    if (status !== 'paid' && status !== 'partial') continue;
    const origin = String(p.bundle_origin_id || p.bundleOriginId || '').trim();
    const id = String(p.$id || p.id || '').trim();
    const isAnchor = !origin || (id && origin === id);
    if (!isAnchor && cat === 'bundle') continue;
    const months = Number(p.bundle_months ?? p.bundleMonths);
    if (!Number.isFinite(months) || months < 6) continue;
    if (months > bestMonths) bestMonths = months;
  }
  if (bestMonths >= 12) return PLAN_BILLING.ANNUAL;
  if (bestMonths >= 6) return PLAN_BILLING.SEMESTER;
  return '';
}

/**
 * Aluno enriquecido com plan_billing quando dá para inferir (catálogo / pacote).
 * @param {object} student
 * @param {object} [financeConfig]
 * @param {Array} [payments]
 */
export function enrichStudentFreezeBilling(student, financeConfig = null, payments = null) {
  if (!student) return student;
  if (resolveFreezePlanKind(student, financeConfig)) return student;
  const fromPayments = inferFreezeBillingFromPayments(payments);
  if (fromPayments) return { ...student, plan_billing: fromPayments };
  return student;
}

/**
 * Plano anual: plan_billing anual ou nome/catálogo indica anual.
 * @param {object} student
 * @param {object} [financeConfig]
 */
export function isAnnualPlanStudent(student, financeConfig = null) {
  return resolveStudentPlanBilling(student, financeConfig) === PLAN_BILLING.ANNUAL;
}

/**
 * Plano semestral: plan_billing semestral ou nome/catálogo indica semestral.
 * @param {object} student
 * @param {object} [financeConfig]
 */
export function isSemesterPlanStudent(student, financeConfig = null) {
  if (isAnnualPlanStudent(student, financeConfig)) return false;
  return resolveStudentPlanBilling(student, financeConfig) === PLAN_BILLING.SEMESTER;
}

/**
 * Tipo de cota de trancamento. Qualquer plano pode trancar:
 * semestral → 45 dias / ~182; demais (anual, mensal, indefinido) → 90 dias / ~365.
 * @returns {'annual'|'semester'}
 */
export function resolveFreezePlanKind(student, financeConfig = null) {
  if (isSemesterPlanStudent(student, financeConfig)) return 'semester';
  return 'annual';
}

export function freezePeriodDays(student, financeConfig = null) {
  return resolveFreezePlanKind(student, financeConfig) === 'semester'
    ? FREEZE_PERIOD_DAYS_SEMESTER
    : FREEZE_PERIOD_DAYS_ANNUAL;
}

export function freezeQuotaMaxDays(student, financeConfig = null) {
  return resolveFreezePlanKind(student, financeConfig) === 'semester'
    ? FREEZE_MAX_DAYS_SEMESTER
    : FREEZE_MAX_DAYS_PER_YEAR;
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

export function canStartPlanFreeze(student, financeConfig = null, today = new Date(), payments = null) {
  const enriched = enrichStudentFreezeBilling(student, financeConfig, payments);
  if (!resolveFreezePlanKind(enriched, financeConfig)) return false;
  if (isFreezeActive(enriched)) return false;
  if (freezeDaysRemaining(enriched, today, financeConfig) <= 0) return false;
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
