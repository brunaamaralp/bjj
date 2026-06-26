import { findPlanByName } from './academyPlans.js';
import { centsToNumber, parseMaskToCents } from './moneyBr.js';

export { effectiveStudentPlan } from './financeStudentRoster.js';

export const DISCOUNT_TYPES = Object.freeze({
  NONE: 'none',
  FIXED: 'fixed',
  PERCENT: 'percent',
});

export function isExemptPlan(plan) {
  return plan?.isExempt === true;
}

export function getStudentDiscountAmount(student = {}) {
  const raw = Number(student?.discount_amount ?? student?.discountAmount ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(raw * 100) / 100;
}

/**
 * Normaliza tipo de desconto. Registros antigos só com discount_amount → fixed.
 */
export function normalizeDiscountType(studentOrType, discountAmountMaybe) {
  if (studentOrType && typeof studentOrType === 'object') {
    const raw = String(studentOrType.discount_type ?? studentOrType.discountType ?? '')
      .trim()
      .toLowerCase();
    if (raw === DISCOUNT_TYPES.FIXED || raw === DISCOUNT_TYPES.PERCENT) return raw;
    return getStudentDiscountAmount(studentOrType) > 0 ? DISCOUNT_TYPES.FIXED : DISCOUNT_TYPES.NONE;
  }
  const raw = String(studentOrType ?? DISCOUNT_TYPES.NONE).trim().toLowerCase();
  if (raw === DISCOUNT_TYPES.FIXED || raw === DISCOUNT_TYPES.PERCENT) return raw;
  const amount = Number(discountAmountMaybe) || 0;
  return amount > 0 ? DISCOUNT_TYPES.FIXED : DISCOUNT_TYPES.NONE;
}

export function parseDiscountAmountInput(value, discountType) {
  const type = normalizeDiscountType(discountType);
  if (type === DISCOUNT_TYPES.PERCENT) {
    const raw = String(value || '').replace(',', '.').trim();
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  }
  if (type === DISCOUNT_TYPES.FIXED) {
    return centsToNumber(parseMaskToCents(value)) || 0;
  }
  return 0;
}

export function formatDiscountAmountForInput(amount, discountType) {
  const type = normalizeDiscountType(discountType, amount);
  const n = Number(amount) || 0;
  if (n <= 0) return '';
  if (type === DISCOUNT_TYPES.PERCENT) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
  }
  return n.toFixed(2).replace('.', ',');
}

/**
 * @param {number} planPrice
 * @param {object|number} enrollment — documento com discount_type/discount_amount ou valor fixo legado
 */
export function calcFinalPrice(planPrice, enrollment = 0) {
  const price = Number(planPrice) || 0;
  if (typeof enrollment === 'number' || enrollment == null) {
    const discount = Number(enrollment) || 0;
    return Math.max(0, Math.round((price - discount) * 100) / 100);
  }

  const type = normalizeDiscountType(enrollment);
  const amount = getStudentDiscountAmount(enrollment);
  if (type === DISCOUNT_TYPES.NONE || amount <= 0) {
    return Math.max(0, Math.round(price * 100) / 100);
  }
  if (type === DISCOUNT_TYPES.PERCENT) {
    const pct = Math.min(100, amount);
    return Math.max(0, Math.round(price * (1 - pct / 100) * 100) / 100);
  }
  return Math.max(0, Math.round((price - amount) * 100) / 100);
}

export function validateEnrollmentDiscount(planPrice, discountType, discountAmount) {
  const price = Number(planPrice) || 0;
  const type = normalizeDiscountType(discountType, discountAmount);
  const amount = Number(discountAmount) || 0;
  if (type === DISCOUNT_TYPES.NONE || amount <= 0) return '';
  if (type === DISCOUNT_TYPES.PERCENT) {
    if (amount > 100) return 'O desconto percentual não pode ser maior que 100%.';
    return '';
  }
  if (price > 0 && amount >= price) {
    return 'O desconto não pode ser maior ou igual ao valor do plano.';
  }
  return '';
}

export function formatDiscountSummaryLabel(discountType, discountAmount) {
  const type = normalizeDiscountType(discountType, discountAmount);
  const amount = Number(discountAmount) || 0;
  if (type === DISCOUNT_TYPES.NONE || amount <= 0) return '';
  if (type === DISCOUNT_TYPES.PERCENT) {
    const pctLabel = Number.isInteger(amount) ? String(amount) : amount.toLocaleString('pt-BR');
    return `Desconto: ${pctLabel}%`;
  }
  return `Desconto: ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
}

export function formatEnrollmentDiscountPreview(planPrice, discountType, discountAmount) {
  const price = Number(planPrice) || 0;
  const type = normalizeDiscountType(discountType, discountAmount);
  const amount = Number(discountAmount) || 0;
  const priceLabel = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const finalPrice = calcFinalPrice(price, {
    discount_type: type,
    discount_amount: amount,
  });
  const finalLabel = finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (type === DISCOUNT_TYPES.NONE || amount <= 0) {
    return `Plano ${priceLabel}/mês`;
  }
  if (type === DISCOUNT_TYPES.PERCENT) {
    const pctLabel = Number.isInteger(amount) ? String(amount) : amount.toLocaleString('pt-BR');
    return `Plano ${priceLabel} − ${pctLabel}% = ${finalLabel}/mês`;
  }
  const discountLabel = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `Plano ${priceLabel} − ${discountLabel} = ${finalLabel}/mês`;
}

export function resolveStudentPlan(student, financeConfig, payment = null) {
  const planName = String(student?.plan || payment?.plan_name || '').trim();
  if (!planName) return null;
  return findPlanByName(financeConfig, planName);
}

export function resolveStudentPlanFinalPrice(student, financeConfig, payment = null) {
  const plan = resolveStudentPlan(student, financeConfig, payment);
  return calcFinalPrice(plan?.price, student);
}

export function isStudentOnExemptPlan(student, financeConfig, payment = null) {
  return isExemptPlan(resolveStudentPlan(student, financeConfig, payment));
}
