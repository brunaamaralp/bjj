/**
 * Planos comerciais do Nave — delega para planConfig.js (fonte única da verdade).
 * Mantém compatibilidade com os imports existentes em api/billing.js (listPlansForDisplay, resolvePlan).
 */
import { PLAN_CONFIG, PLAN_KEYS } from '../../src/lib/planConfig.js';

const DEFAULT_BETA = 297;

function betaValue() {
  const raw = String(process.env.ASAAS_PLAN_BETA_VALUE || '').trim();
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : DEFAULT_BETA;
}

export { PLAN_CONFIG };

/** @deprecated Use PLAN_CONFIG de planConfig.js */
export const PLANS = {
  beta: {
    slug: 'beta',
    name: 'Nave Beta',
    description: 'Acesso completo durante o período beta',
    asaasCycle: 'MONTHLY',
    get value() { return betaValue(); },
  },
};

export function getDefaultPlan() { return PLANS.beta; }

export function getPlanBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (PLAN_CONFIG[s]) {
    return {
      slug: s,
      name: PLAN_CONFIG[s].name,
      description: PLAN_CONFIG[s].description,
      asaasCycle: 'MONTHLY',
      value: PLAN_CONFIG[s].price,
    };
  }
  return PLANS.beta;
}

export function getActivePlans() { return [PLANS.beta]; }

/**
 * Resolve plano para checkout Asaas.
 * Aceita starter/studio/pro (novos) e beta/monthly/annual (legados).
 * @param {string} slug
 * @returns {{ slug: string, cycle: string, value: number, label: string } | null}
 */
export function resolvePlan(slug) {
  const s = String(slug || '').trim().toLowerCase();
  // Planos novos
  if (PLAN_CONFIG[s]) {
    return {
      slug: s,
      cycle: 'MONTHLY',
      value: PLAN_CONFIG[s].price,
      label: `Nave ${PLAN_CONFIG[s].name} — assinatura mensal`,
    };
  }
  // Legado
  if (!s || s === 'beta' || s === 'monthly' || s === 'mensal' || s === 'annual' || s === 'anual') {
    const value = betaValue();
    return { slug: 'starter', cycle: 'MONTHLY', value, label: 'Nave Starter — assinatura mensal' };
  }
  return null;
}

/**
 * Lista planos para UI/API.
 */
export function listPlansForDisplay() {
  return PLAN_KEYS.map((key) => {
    const p = PLAN_CONFIG[key];
    return {
      slug: key,
      cycle: 'MONTHLY',
      value: p.price,
      label: `Nave ${p.name} — assinatura mensal`,
      name: p.name,
      description: p.description,
      threads: p.threads,
      overage_price: p.overage_price,
    };
  });
}
