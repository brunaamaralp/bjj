/** @typedef {'monthly' | 'annual'} PlanSlug */

const DEFAULT_MONTHLY = 99.9;
const DEFAULT_ANNUAL = 999.0;

/**
 * @param {string} slug
 */
export function resolvePlan(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (s === 'monthly' || s === 'mensal') {
    const value = parseFloat(process.env.ASAAS_PLAN_MONTHLY_VALUE || String(DEFAULT_MONTHLY), 10);
    return {
      slug: 'monthly',
      cycle: 'MONTHLY',
      value: Number.isFinite(value) ? value : DEFAULT_MONTHLY,
      label: 'Plano mensal — Nave',
    };
  }
  if (s === 'annual' || s === 'anual') {
    const value = parseFloat(process.env.ASAAS_PLAN_ANNUAL_VALUE || String(DEFAULT_ANNUAL), 10);
    return {
      slug: 'annual',
      cycle: 'YEARLY',
      value: Number.isFinite(value) ? value : DEFAULT_ANNUAL,
      label: 'Plano anual — Nave',
    };
  }
  return null;
}

/**
 * Lista planos disponíveis para UI (valores resolvidos no servidor).
 */
export function listPlansForDisplay() {
  const m = resolvePlan('monthly');
  const a = resolvePlan('annual');
  return [m ? { ...m } : null, a ? { ...a } : null].filter(Boolean);
}
