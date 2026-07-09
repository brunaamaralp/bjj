// academyPlans = planos de mensalidade de alunos (financeConfig).
// planConfig = assinatura comercial do Nave (Asaas). São coisas distintas.
/** Planos da academia (financeConfig.plans) — evita digitação livre inconsistente. */

/** Plano isento padrão — disponível em todo cadastro/matrícula sem configuração manual. */
export const BUILTIN_EXEMPT_PLAN_NAME = 'Isento';

export const BUILTIN_EXEMPT_PLAN = Object.freeze({
  name: BUILTIN_EXEMPT_PLAN_NAME,
  price: 0,
  isExempt: true,
  applyCardFee: false,
  builtin: true,
});

function planNameKey(plan) {
  return String(plan?.name || '').trim().toLowerCase();
}

/**
 * Garante o plano "Isento" na lista (somente leitura; não persiste automaticamente).
 * Não altera planos já cadastrados com o mesmo nome.
 */
export function ensureBuiltinExemptPlan(plans) {
  const list = Array.isArray(plans) ? [...plans] : [];
  if (list.some((p) => planNameKey(p) === planNameKey(BUILTIN_EXEMPT_PLAN))) {
    return list;
  }
  return [...list, { ...BUILTIN_EXEMPT_PLAN }];
}

export function getConfiguredPlans(financeConfig) {
  return (financeConfig?.plans || [])
    .map((p) => ({
      ...p,
      name: String(p?.name || '').trim(),
      price: Number(p?.price ?? 0),
    }))
    .filter((p) => p.name);
}

export function planOptionLabel(plan) {
  const name = String(plan?.name || '').trim();
  if (!name) return '';
  if (plan?.isExempt === true) {
    return `${name} (Isento)`;
  }
  const price = Number(plan?.price ?? 0);
  if (Number.isFinite(price) && price > 0) {
    return `${name} · R$ ${price.toFixed(2).replace('.', ',')}`;
  }
  return name;
}

export function findPlanByName(financeConfig, planName) {
  const key = String(planName || '').trim().toLowerCase();
  if (!key) return null;
  const found = getConfiguredPlans(financeConfig).find((p) => p.name.toLowerCase() === key);
  if (found) return found;
  if (key === planNameKey(BUILTIN_EXEMPT_PLAN)) {
    return { ...BUILTIN_EXEMPT_PLAN };
  }
  return null;
}

/** Opções do select: planos cadastrados + valor atual se não estiver na lista. */
export function buildPlanSelectOptions(financeConfig, currentValue = '') {
  const configured = getConfiguredPlans(financeConfig);
  const current = String(currentValue || '').trim();
  const names = new Set(configured.map((p) => p.name.toLowerCase()));
  const options = configured.map((p) => ({
    value: p.name,
    label: planOptionLabel(p),
    plan: p,
  }));
  if (current && !names.has(current.toLowerCase())) {
    options.unshift({ value: current, label: `${current} (cadastro anterior)`, plan: null });
  }
  return options;
}

export function planPriceToPayAmountString(plan) {
  const price = Number(plan?.price ?? 0);
  if (!Number.isFinite(price) || price <= 0) return '';
  return price.toFixed(2).replace('.', ',');
}

/** Alinha nome importado ao plano cadastrado (case insensitive). */
export function normalizeImportedPlanName(raw, financeConfig) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const match = findPlanByName(financeConfig, v);
  return match ? match.name : v;
}
