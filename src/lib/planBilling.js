import { findPlanByName } from './academyPlans.js';

export function isExemptPlan(plan) {
  return plan?.isExempt === true;
}

export function resolveStudentPlan(student, financeConfig, payment = null) {
  const planName = String(student?.plan || payment?.plan_name || '').trim();
  if (!planName) return null;
  return findPlanByName(financeConfig, planName);
}

export function isStudentOnExemptPlan(student, financeConfig, payment = null) {
  return isExemptPlan(resolveStudentPlan(student, financeConfig, payment));
}
