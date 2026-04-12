/**
 * Checklist de onboarding gravado em academia.onboardingChecklist (JSON).
 * Se o atributo não existir no Appwrite (schema antigo) ou vier vazio, usamos estes defaults.
 */
export const DEFAULT_ONBOARDING_CHECKLIST = [
  { id: 'academy_info', title: 'Atualizar dados da academia', done: false },
  { id: 'ui_labels', title: 'Definir rótulos (Aulas/Alunos/Leads)', done: false },
  { id: 'quick_times', title: 'Adicionar horários rápidos', done: false },
  { id: 'first_lead', title: 'Criar primeiro lead', done: false },
  { id: 'install_pwa', title: 'Instalar atalho no celular', done: false },
];

export function parseOnboardingChecklist(raw) {
  if (raw == null || raw === '') {
    return DEFAULT_ONBOARDING_CHECKLIST.map((x) => ({ ...x }));
  }
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || arr.length === 0) {
      return DEFAULT_ONBOARDING_CHECKLIST.map((x) => ({ ...x }));
    }
    return arr.map((it) => ({
      id: String(it?.id || '').trim() || 'unknown',
      title: String(it?.title || '').trim() || 'Passo',
      done: Boolean(it?.done),
    }));
  } catch {
    return DEFAULT_ONBOARDING_CHECKLIST.map((x) => ({ ...x }));
  }
}

/** Rota sugerida por id do passo (null = só mensagem / sem navegação). */
export function onboardingStepPath(stepId) {
  const id = String(stepId || '').trim();
  switch (id) {
    case 'academy_info':
    case 'ui_labels':
      return '/empresa';
    case 'quick_times':
      return '/pipeline';
    case 'first_lead':
      return '/new-lead';
    case 'install_pwa':
      return null;
    default:
      return '/';
  }
}

export function onboardingDismissStorageKey(academyId) {
  return `navi_onboarding_dismissed_${String(academyId || '').trim()}`;
}

const ORDER_IDS = DEFAULT_ONBOARDING_CHECKLIST.map((x) => x.id);

/**
 * Garante todos os passos padrão e marca ids como done.
 * @param {Array<{id:string,title:string,done:boolean}>|null|undefined} currentList
 * @param {string[]} idsToComplete
 */
export function mergeOnboardingStepIdsDone(currentList, idsToComplete) {
  const want = new Set((idsToComplete || []).map((x) => String(x || '').trim()).filter(Boolean));
  let base = Array.isArray(currentList) && currentList.length > 0 ? currentList.map((x) => ({ ...x })) : parseOnboardingChecklist(null);
  const byId = new Map(base.map((x) => [x.id, x]));
  for (const def of DEFAULT_ONBOARDING_CHECKLIST) {
    if (!byId.has(def.id)) {
      byId.set(def.id, { ...def });
    }
  }
  for (const id of want) {
    const row = byId.get(id);
    if (row) row.done = true;
    else {
      const def = DEFAULT_ONBOARDING_CHECKLIST.find((d) => d.id === id);
      byId.set(id, { id, title: def?.title || 'Passo', done: true });
    }
  }
  const extra = [...byId.keys()].filter((id) => !ORDER_IDS.includes(id));
  const ordered = ORDER_IDS.map((id) => byId.get(id)).filter(Boolean);
  for (const id of extra) {
    ordered.push(byId.get(id));
  }
  return ordered;
}

/** Dias corridos restantes até isoEnd (mínimo 0). */
export function trialDaysRemaining(isoEnd) {
  if (!isoEnd) return null;
  const end = new Date(isoEnd);
  if (Number.isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 86400000);
}
