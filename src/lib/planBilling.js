import { findPlanByName } from './academyPlans.js';

export function isExemptPlan(plan) {
  return plan?.isExempt === true;
}

export function getStudentDiscountAmount(student = {}) {
  const raw = Number(student?.discount_amount ?? student?.discountAmount ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(raw * 100) / 100;
}

export function calcFinalPrice(planPrice, discountAmount = 0) {
  const price = Number(planPrice) || 0;
  const discount = Number(discountAmount) || 0;
  return Math.max(0, Math.round((price - discount) * 100) / 100);
}

export function resolveStudentPlan(student, financeConfig, payment = null) {
  const planName = String(student?.plan || payment?.plan_name || '').trim();
  if (!planName) return null;
  return findPlanByName(financeConfig, planName);
}

export function resolveStudentPlanFinalPrice(student, financeConfig, payment = null) {
  const plan = resolveStudentPlan(student, financeConfig, payment);
  return calcFinalPrice(plan?.price, getStudentDiscountAmount(student));
}

export function isStudentOnExemptPlan(student, financeConfig, payment = null) {
  return isExemptPlan(resolveStudentPlan(student, financeConfig, payment));
}
