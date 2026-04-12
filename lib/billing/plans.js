/** Plano beta único (mensal), valor via ASAAS_PLAN_BETA_VALUE. */

const DEFAULT_BETA = 297;

function betaValue() {
  const raw = String(process.env.ASAAS_PLAN_BETA_VALUE || '').trim();
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : DEFAULT_BETA;
}

export const PLANS = {
  beta: {
    slug: 'beta',
    name: 'Nave Beta',
    description: 'Acesso completo durante o período beta',
    asaasCycle: 'MONTHLY',
    get value() {
      return betaValue();
    },
  },
};

export function getDefaultPlan() {
  return PLANS.beta;
}

/**
 * @param {string} slug
 */
export function getPlanBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (s === 'beta') return PLANS.beta;
  return PLANS.beta;
}

export function getActivePlans() {
  return [PLANS.beta];
}

/**
 * Plano resolvido para checkout Asaas (shape esperado por runCheckout).
 * Aceita slugs legados (monthly/annual) como alias do plano beta.
 * @param {string} slug
 * @returns {{ slug: string, cycle: string, value: number, label: string } | null}
 */
export function resolvePlan(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (
    !s ||
    s === 'beta' ||
    s === 'monthly' ||
    s === 'mensal' ||
    s === 'annual' ||
    s === 'anual'
  ) {
    const value = betaValue();
    return {
      slug: 'beta',
      cycle: 'MONTHLY',
      value,
      label: 'Nave Beta — assinatura mensal',
    };
  }
  return null;
}

/**
 * Lista planos para UI/API (objetos serializáveis com valor numérico).
 */
export function listPlansForDisplay() {
  const p = resolvePlan('beta');
  if (!p) return [];
  return [
    {
      slug: p.slug,
      cycle: p.cycle,
      value: p.value,
      label: p.label,
      name: PLANS.beta.name,
      description: PLANS.beta.description,
    },
  ];
}
