// lib/professorCompensation.js
export const DEFAULT_PRODUCT_DISCOUNT_PCT = 30;

export function normalizeProfessorCompensation(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const pct = Number(src.product_discount_pct);
  const product_discount_pct =
    Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : DEFAULT_PRODUCT_DISCOUNT_PCT;

  const role = (key) => {
    const r = src.roles?.[key] || {};
    return {
      lesson_amount: Math.max(0, Number(r.lesson_amount) || 0),
      experimental_amount: Math.max(0, Number(r.experimental_amount) || 0),
    };
  };

  const overrides = {};
  for (const [ref, o] of Object.entries(src.overrides || {})) {
    if (!ref) continue;
    const lesson = o?.lesson_amount;
    const exp = o?.experimental_amount;
    overrides[ref] = {
      ...(lesson != null && Number.isFinite(Number(lesson))
        ? { lesson_amount: Math.max(0, Number(lesson)) }
        : {}),
      ...(exp != null && Number.isFinite(Number(exp))
        ? { experimental_amount: Math.max(0, Number(exp)) }
        : {}),
    };
  }

  return {
    product_discount_pct,
    roles: {
      professor: role('professor'),
      instructor: role('instructor'),
    },
    overrides,
  };
}

export function resolveStaffRates(cfg, staffRef, role) {
  const c = normalizeProfessorCompensation(cfg);
  const base =
    role === 'instructor' ? c.roles.instructor : c.roles.professor;
  const o = c.overrides[String(staffRef || '').trim()] || {};
  return {
    lesson_amount: o.lesson_amount != null ? o.lesson_amount : base.lesson_amount,
    experimental_amount:
      o.experimental_amount != null ? o.experimental_amount : base.experimental_amount,
  };
}

export function computeProductDebitAmount({ unitPrice, qty, discountPct }) {
  const price = Math.max(0, Number(unitPrice) || 0);
  const q = Math.max(0, Math.trunc(Number(qty) || 0));
  const d = Math.min(100, Math.max(0, Number(discountPct) || 0));
  const factor = 1 - d / 100;
  return Math.round(price * q * factor * 100) / 100;
}
