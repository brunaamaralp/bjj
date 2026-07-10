import { ID, Query } from 'appwrite';
import { databases, DB_ID } from './appwrite.js';
import { freezeStudentApi, listPlanFreezesApi, unfreezeStudentApi } from './studentsApi.js';
import { applyTaskTemplateForTrigger, TASK_TEMPLATE_TRIGGERS } from './applyTaskTemplateClient.js';
import {
  findPaymentForMonthUpsert,
  upsertStudentPayment,
  getStudentPayments,
} from './studentPayments.js';
import { PAYMENT_CATEGORY } from './paymentCategories.js';
import { coverageEndMonth } from './bundleCoverage.js';
import { isBundleAnchorPayment } from './paymentCategories.js';
import { revokeControlIdStudent } from './controlidApi.js';
import { readControlIdConfig } from '../../lib/controlidSettings.js';
import {
  buildFrozenPaymentFields,
  monthsToRevertOnUnfreeze,
} from '../../lib/planFreezeProjection.js';
import {
  FREEZE_STATUS_ACTIVE,
  effectiveFreezeDaysUsed,
  planYearStartYmd,
  referenceMonthsInRange,
  computeDurationDays,
  bundleExtensionMonthsFromDays,
  paymentFreezeEndYmd,
  isFreezeIndefinite,
  toYmd,
  parseYmdLocal,
  isFreezeActive,
} from '../../lib/planFreezeCore.js';

const PLAN_FREEZES_COL = import.meta.env.VITE_APPWRITE_PLAN_FREEZES_COLLECTION_ID || '';
const PAYMENTS_COL = import.meta.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID || '';

function freezeIsoFromYmd(ymd) {
  return `${String(ymd).slice(0, 10)}T12:00:00.000Z`;
}

export { monthsToRevertOnUnfreeze } from '../../lib/planFreezeProjection.js';

export {
  canStartPlanFreeze,
  isAnnualPlanStudent,
  isFreezeActive,
  isFreezeIndefinite,
  effectiveFreezeDaysUsed,
  projectedFreezeDaysUsed,
  activeFreezeElapsedDays,
  minRetroactiveStartYmd,
  freezeDaysRemaining,
  freezeDaysLeftInPeriod,
  FREEZE_MAX_DAYS_PER_YEAR,
  FREEZE_LIMIT_ALERT_DAYS_USED,
  shouldAlertFreezeLimit,
  paymentFreezeEndYmd,
  computeReturnYmd,
  computeDurationDays,
  validateFreezeRequest,
  toYmd,
  FREEZE_LIMIT_ALERT_MARKER,
  buildFreezeLimitAlertDescription,
} from '../../lib/planFreezeCore.js';

/** Motivo do trancamento ativo (histórico plan_freezes). */
export function activeFreezeReasonFromHistory(planFreezes, student) {
  if (!isFreezeActive(student)) return '';
  const start = String(student?.freeze_start || student?.freezeStart || '').trim().slice(0, 10);
  if (!start) return '';
  const match = (planFreezes || []).find((fr) => {
    const frStart = String(fr.start_date || fr.startDate || '').trim().slice(0, 10);
    return frStart === start;
  });
  return String(match?.reason || '').trim();
}

export function formatFreezeDateBr(ymd) {
  const d = parseYmdLocal(ymd);
  if (!d) return String(ymd || '—');
  return d.toLocaleDateString('pt-BR');
}

export async function listPlanFreezes(leadId, academyId, { limit = 50 } = {}) {
  if (!leadId || !academyId) return [];
  try {
    return await listPlanFreezesApi(leadId, { limit });
  } catch (e) {
    console.warn('[listPlanFreezes] API:', e?.message || e);
    if (!PLAN_FREEZES_COL) return [];
    try {
      const res = await databases.listDocuments(DB_ID, PLAN_FREEZES_COL, [
        Query.equal('lead_id', String(leadId).trim()),
        Query.equal('academy_id', String(academyId).trim()),
        Query.orderDesc('start_date'),
        Query.limit(Math.min(limit, 100)),
      ]);
      return res.documents || [];
    } catch {
      return [];
    }
  }
}

async function markPaymentsFrozen({ leadId, academyId, startYmd, endYmd, planName, teamId, userId }) {
  if (!PAYMENTS_COL) return { updated: 0 };
  const months = referenceMonthsInRange(startYmd, endYmd);
  let updated = 0;
  const issuedAt = new Date().toISOString();

  for (const reference_month of months) {
    const existing = await findPaymentForMonthUpsert(leadId, reference_month, PAYMENT_CATEGORY.PLAN);
    const base = buildFrozenPaymentFields({
      leadId,
      academyId,
      referenceMonth: reference_month,
      planName,
      existing,
      issuedAt,
    });
    await upsertStudentPayment({
      data: { ...base, team_id: teamId, registered_by: userId },
      existingId: existing?.$id || null,
      skipMirror: true,
    });
    updated += 1;
  }
  return { updated };
}

async function revertFrozenPaymentsAfterUnfreeze({
  leadId,
  academyId,
  unfreezeYmd,
  freezeStartYmd,
  freezeEndYmd,
}) {
  if (!PAYMENTS_COL) return { reverted: 0 };
  const monthsToRevert = new Set(monthsToRevertOnUnfreeze(unfreezeYmd, freezeStartYmd, freezeEndYmd));
  if (!monthsToRevert.size) return { reverted: 0 };

  const payments = await getStudentPayments(leadId, academyId || '');
  let reverted = 0;

  for (const p of payments) {
    const ym = String(p.reference_month || '');
    if (!monthsToRevert.has(ym)) continue;
    if (String(p.status || '').toLowerCase() !== 'frozen') continue;

    const patch = {
      status: 'pending',
      covered_reason: null,
      note: String(p.note || '').replace(/^Trancamento — /, '').trim() || '',
    };
    try {
      await databases.updateDocument(DB_ID, PAYMENTS_COL, p.$id, patch);
      reverted += 1;
    } catch (e) {
      console.warn('[planFreeze] unfreeze payment:', p.$id, e?.message);
    }
  }
  return { reverted };
}

async function shortenPlanFreezeRecordClient({ leadId, academyId, freezeStartYmd, newEndYmd }) {
  if (!PLAN_FREEZES_COL) return { updated: false };
  const start = String(freezeStartYmd || '').slice(0, 10);
  const end = String(newEndYmd || '').slice(0, 10);
  if (!start || !end) return { updated: false };

  try {
    const res = await databases.listDocuments(DB_ID, PLAN_FREEZES_COL, [
      Query.equal('lead_id', String(leadId).trim()),
      Query.equal('academy_id', String(academyId).trim()),
      Query.orderDesc('start_date'),
      Query.limit(20),
    ]);
    const match = (res.documents || []).find((fr) => {
      const frStart = String(fr.start_date || fr.startDate || '').trim().slice(0, 10);
      return frStart === start;
    });
    if (!match?.$id) return { updated: false, reason: 'freeze_record_not_found' };

    await databases.updateDocument(DB_ID, PLAN_FREEZES_COL, match.$id, {
      end_date: freezeIsoFromYmd(end),
      indefinite: false,
      days: computeDurationDays(start, end),
    });
    return { updated: true, freezeId: match.$id };
  } catch (e) {
    console.warn('[planFreeze] shorten plan_freezes:', e?.message || e);
    return { updated: false, error: e?.message };
  }
}

/**
 * Estende pacote anual (bundle) após trancamento.
 */
export async function extendBundleAfterFreeze({ leadId, academyId, daysUsed, payments, teamId, userId }) {
  if (!PAYMENTS_COL || daysUsed <= 0) return { extended: 0 };

  const anchor = (payments || []).find(
    (p) => isBundleAnchorPayment(p) && ['paid', 'covered'].includes(String(p.status || '').toLowerCase())
  );
  if (!anchor) return { extended: 0 };

  const monthsToAdd = bundleExtensionMonthsFromDays(daysUsed);
  const bundleMonths = Number(anchor.bundle_months) || 12;
  const startYm = String(anchor.reference_month || '');
  const lastYm = coverageEndMonth(startYm, bundleMonths);

  const base = {
    lead_id: leadId,
    academy_id: academyId,
    method: anchor.method || 'pix',
    account: anchor.account || '',
    plan_name: anchor.plan_name || '',
    registered_by: anchor.registered_by || userId || '',
    registered_by_name: anchor.registered_by_name || '',
    status: 'covered',
    payment_category: PAYMENT_CATEGORY.BUNDLE,
  };

  let cursorYm = lastYm;
  let created = 0;
  for (let i = 0; i < monthsToAdd; i += 1) {
    const d = new Date(`${cursorYm}-02T12:00:00`);
    d.setMonth(d.getMonth() + 1);
    cursorYm = d.toISOString().slice(0, 7);
    const existing = await findPaymentForMonthUpsert(leadId, cursorYm, PAYMENT_CATEGORY.BUNDLE);
    if (existing && ['paid', 'covered'].includes(String(existing.status || '').toLowerCase())) {
      continue;
    }
    await upsertStudentPayment({
      data: {
        ...base,
        team_id: teamId,
        reference_month: cursorYm,
        amount: 0,
        bundle_origin_id: String(anchor.bundle_origin_id || anchor.$id),
        note: `Extensão por trancamento (${daysUsed} dias)`,
      },
      existingId: existing?.$id || null,
      skipMirror: true,
    });
    created += 1;
  }

  const newBundleMonths = bundleMonths + created;
  try {
    await databases.updateDocument(DB_ID, PAYMENTS_COL, anchor.$id, {
      bundle_months: newBundleMonths,
    });
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('Unknown attribute')) throw e;
  }

  return { extended: created, newEndYm: cursorYm, newBundleMonths };
}

/**
 * @param {object} opts
 */
export async function startPlanFreeze({
  student,
  leadId,
  academyId,
  startYmd,
  endYmd,
  durationDays,
  reason = '',
  indefinite = false,
  userId,
  teamId,
  updateLead,
  mergeStudent,
  onAfterFreeze,
  academySettingsRaw = null,
}) {
  const apiRes = await freezeStudentApi({
    student_id: leadId,
    start_ymd: startYmd,
    end_ymd: endYmd,
    duration_days: durationDays,
    reason,
    indefinite,
  });

  const sYmd = apiRes.startYmd;
  const eYmd = apiRes.endYmd;
  const days = apiRes.days;
  const isIndefinite = apiRes.indefinite === true;
  const newDaysUsed = apiRes.freeze_days_used;

  const localPatch = {
    freeze_start: freezeIsoFromYmd(sYmd),
    freeze_end: isIndefinite ? null : freezeIsoFromYmd(eYmd),
    freeze_status: FREEZE_STATUS_ACTIVE,
    freeze_days_used: newDaysUsed,
  };
  if (mergeStudent) {
    mergeStudent(leadId, localPatch);
  } else if (updateLead) {
    await updateLead(leadId, localPatch);
  }

  const paymentEndYmd = paymentFreezeEndYmd({
    startYmd: sYmd,
    endYmd: eYmd,
    indefinite: isIndefinite,
  });

  await markPaymentsFrozen({
    leadId,
    academyId,
    startYmd: sYmd,
    endYmd: paymentEndYmd,
    planName: student?.plan || '',
    teamId,
    userId,
  });

  const controlIdCfg = readControlIdConfig(academySettingsRaw);
  if (controlIdCfg.enabled && student?.controlid_synced) {
    void revokeControlIdStudent(academyId, { leadId }).catch((e) => {
      console.warn('[planFreeze] revoke:', e?.message || e);
    });
  }

  if (onAfterFreeze) {
    try {
      await onAfterFreeze({ leadId, academyId });
    } catch (e) {
      console.warn('[planFreeze] onAfterFreeze:', e?.message || e);
    }
  }

  try {
    await applyTaskTemplateForTrigger({
      academyId,
      trigger: TASK_TEMPLATE_TRIGGERS.STUDENT_FREEZE,
      leadId,
      leadName: String(student?.name || '').trim(),
      anchorDate: sYmd,
    });
  } catch (e) {
    console.warn('[planFreeze] template student_freeze:', e?.message || e);
  }

  return { startYmd: sYmd, endYmd: eYmd, days, indefinite: isIndefinite, freeze_days_used: newDaysUsed };
}

/**
 * Encerra trancamento (antecipado ou programado).
 */
export async function endPlanFreeze({
  student,
  leadId,
  academyId,
  userId,
  teamId,
  updateLead,
  mergeStudent,
  onAfterUnfreeze,
  academySettingsRaw = null,
  early = false,
  payments = null,
}) {
  if (!student || String(student.freeze_status || '') !== FREEZE_STATUS_ACTIVE) {
    return { skipped: true };
  }

  const apiRes = await unfreezeStudentApi({
    student_id: leadId,
    early: early !== false,
  });

  const unfreezePatch = {
    freeze_status: null,
    freeze_start: null,
    freeze_end: null,
    freeze_days_used: apiRes.freeze_days_used,
    freeze_quota_year: apiRes.freeze_quota_year,
  };
  if (mergeStudent) {
    mergeStudent(leadId, unfreezePatch);
  } else if (updateLead) {
    await updateLead(leadId, unfreezePatch);
  }

  if (onAfterUnfreeze) {
    try {
      await onAfterUnfreeze({ leadId, academyId });
    } catch (e) {
      console.warn('[planFreeze] onAfterUnfreeze:', e?.message || e);
    }
  }

  try {
    await applyTaskTemplateForTrigger({
      academyId,
      trigger: TASK_TEMPLATE_TRIGGERS.STUDENT_UNFREEZE,
      leadId,
      leadName: String(student?.name || '').trim(),
      anchorDate: String(apiRes.actualEndYmd || '').slice(0, 10),
    });
  } catch (e) {
    console.warn('[planFreeze] template student_unfreeze:', e?.message || e);
  }

  return {
    daysCharged: apiRes.daysCharged,
    extension: apiRes.extension,
    actualEndYmd: apiRes.actualEndYmd,
  };
}

/** Notificação pendente após cron (localStorage). */
export const PLAN_UNFREEZE_NOTIFY_KEY = 'navi_plan_unfreeze_pending';

export function pushPlanUnfreezeNotification({ leadId, leadName, endYmd }) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(PLAN_UNFREEZE_NOTIFY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? list : [];
    next.push({
      leadId,
      leadName: String(leadName || '').trim(),
      endYmd: String(endYmd || '').slice(0, 10),
      at: new Date().toISOString(),
    });
    window.localStorage.setItem(PLAN_UNFREEZE_NOTIFY_KEY, JSON.stringify(next.slice(-20)));
  } catch {
    void 0;
  }
}

export function consumePlanUnfreezeNotifications() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PLAN_UNFREEZE_NOTIFY_KEY);
    window.localStorage.removeItem(PLAN_UNFREEZE_NOTIFY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
