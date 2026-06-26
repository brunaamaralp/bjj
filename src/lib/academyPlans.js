// academyPlans = planos de mensalidade de alunos (financeConfig).
// planConfig = assinatura comercial do Nave (Asaas). São coisas distintas.
/** Planos da academia (financeConfig.plans) — evita digitação livre inconsistente. */

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
  const price = Number(plan?.price ?? 0);
  if (Number.isFinite(price) && price > 0) {
    return `${name} · R$ ${price.toFixed(2).replace('.', ',')}`;
  }
  return name;
}

export function findPlanByName(financeConfig, planName) {
  const key = String(planName || '').trim().toLowerCase();
  if (!key) return null;
  return getConfiguredPlans(financeConfig).find((p) => p.name.toLowerCase() === key) || null;
}

/** Opções do select: planos cadastrados + valor atual se não estiver na lista. */
export function buildPlanSelectOptions(financeConfig, currentValue = '', options = {}) {
  const { allowEmpty = false, emptyOptionLabel = 'Sem plano' } = options;
  const configured = getConfiguredPlans(financeConfig);
  const current = String(currentValue || '').trim();
  const names = new Set(configured.map((p) => p.name.toLowerCase()));
  const list = configured.map((p) => ({
    value: p.name,
    label: planOptionLabel(p),
    plan: p,
  }));
  if (current && !names.has(current.toLowerCase())) {
    list.unshift({ value: current, label: `${current} (cadastro anterior)`, plan: null });
  }
  if (allowEmpty) {
    list.unshift({ value: '', label: emptyOptionLabel, plan: null });
  }
  return list;
}

/** Rótulo de exibição do plano do aluno (nome + preço quando cadastrado). */
export function resolveStudentPlanDisplayName(financeConfig, planName) {
  const name = String(planName || '').trim();
  if (!name) return '';
  const match = findPlanByName(financeConfig, name);
  return match ? planOptionLabel(match) : name;
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
