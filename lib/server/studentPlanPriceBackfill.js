import {
  getStudentAgreedPlanPrice,
  snapshotPlanPriceFromCatalog,
} from '../../src/lib/planBilling.js';

export function resolvePlanPriceBackfillPatch(studentDoc, financeConfig) {
  if (getStudentAgreedPlanPrice(studentDoc) != null) {
    return { skip: true, reason: 'already_has_snapshot' };
  }
  const planName = String(studentDoc?.plan || '').trim();
  if (!planName) return { skip: true, reason: 'no_plan' };
  const snap = snapshotPlanPriceFromCatalog(financeConfig, planName);
  if (snap == null) return { skip: true, reason: 'plan_not_in_catalog' };
  return { skip: false, patch: { plan_price: snap } };
}
