/**
 * Checklist de onboarding gravado em academia.onboardingChecklist (JSON).
 * No Appwrite o atributo costuma ser String(255): persistir com serializeOnboardingChecklistForDb
 * (só { id, done }); títulos vêm de ONBOARDING_STEP_TITLES em parse/normalize.
 * Passos principais: lead, IA, WhatsApp; fiscal (company_tax) condicional ao billing;
 * install_pwa é secundário (não entra na contagem principal).
 */

export const ONBOARDING_STEP_TITLES = {
  first_lead: 'Criar seu primeiro lead',
  setup_ai: 'Configurar o assistente de IA',
  connect_whatsapp: 'Conectar o WhatsApp',
  company_tax: 'Atualizar CPF/CNPJ da empresa',
  install_pwa: 'Instalar atalho no celular',
};

/** Ordem persistida por defeito (sem company_tax — injetado na UI quando necessário). */
export const DEFAULT_ONBOARDING_CHECKLIST = [
  { id: 'first_lead', title: ONBOARDING_STEP_TITLES.first_lead, done: false },
  { id: 'setup_ai', title: ONBOARDING_STEP_TITLES.setup_ai, done: false },
  { id: 'connect_whatsapp', title: ONBOARDING_STEP_TITLES.connect_whatsapp, done: false },
  { id: 'install_pwa', title: ONBOARDING_STEP_TITLES.install_pwa, done: false },
];

const DEFAULT_ORDER_IDS = DEFAULT_ONBOARDING_CHECKLIST.map((x) => x.id);

const LEGACY_IDS = new Set(['academy_info', 'ui_labels', 'quick_times']);

function cloneDefault() {
  return DEFAULT_ONBOARDING_CHECKLIST.map((x) => ({ ...x }));
}

function hasLegacyShape(list) {
  return list.some((it) => LEGACY_IDS.has(String(it?.id || '').trim()));
}

/**
 * Migra checklist antigo (academy_info, ui_labels, quick_times) para o novo modelo.
 */
function migrateLegacyChecklist(oldList) {
  const byId = Object.fromEntries(
    oldList.map((it) => [String(it?.id || '').trim(), Boolean(it?.done)])
  );
  return [
    { id: 'first_lead', title: ONBOARDING_STEP_TITLES.first_lead, done: Boolean(byId.first_lead) },
    { id: 'setup_ai', title: ONBOARDING_STEP_TITLES.setup_ai, done: Boolean(byId.setup_ai) },
    { id: 'connect_whatsapp', title: ONBOARDING_STEP_TITLES.connect_whatsapp, done: Boolean(byId.connect_whatsapp) },
    { id: 'install_pwa', title: ONBOARDING_STEP_TITLES.install_pwa, done: Boolean(byId.install_pwa) },
  ];
}

/**
 * Normaliza lista vinda do Appwrite: defaults, migração legada, preserva company_tax e extras.
 */
export function normalizeOnboardingChecklistList(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return cloneDefault();
  }
  const cleaned = list.map((it) => ({
    id: String(it?.id || '').trim() || 'unknown',
    title: String(it?.title || '').trim() || 'Passo',
    done: Boolean(it?.done),
  }));

  let base = cleaned;
  if (hasLegacyShape(cleaned)) {
    base = migrateLegacyChecklist(cleaned);
  }

  const byId = new Map(base.map((x) => [x.id, { ...x }]));
  for (const def of DEFAULT_ONBOARDING_CHECKLIST) {
    if (!byId.has(def.id)) {
      byId.set(def.id, { ...def });
    } else {
      const row = byId.get(def.id);
      row.title = ONBOARDING_STEP_TITLES[def.id] || def.title;
    }
  }

  const ordered = DEFAULT_ORDER_IDS.map((id) => byId.get(id)).filter(Boolean);
  const extra = [...byId.keys()].filter((id) => !DEFAULT_ORDER_IDS.includes(id));
  for (const id of extra) {
    ordered.push(byId.get(id));
  }
  return ordered;
}

/** Gravação no Appwrite: JSON curto (≤255) sem duplicar títulos longos no documento. */
export function serializeOnboardingChecklistForDb(list) {
  const norm = normalizeOnboardingChecklistList(Array.isArray(list) ? list : null);
  return JSON.stringify(norm.map(({ id, done }) => ({ id, done: Boolean(done) })));
}

export function parseOnboardingChecklist(raw) {
  if (raw == null || raw === '') {
    return cloneDefault();
  }
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || arr.length === 0) {
      return cloneDefault();
    }
    return normalizeOnboardingChecklistList(arr);
  } catch {
    return cloneDefault();
  }
}

/** Passos que contam para “Faltam X de Y” e conclusão do banner principal. */
export const CORE_ONBOARDING_IDS = ['first_lead', 'setup_ai', 'connect_whatsapp', 'company_tax'];

/** Só PWA; chips / dica separada. */
export const SECONDARY_ONBOARDING_IDS = ['install_pwa'];

/**
 * @param {Array<{id:string,title:string,done:boolean}>} list
 * @param {{ companyTaxOk?: boolean, accessLevel?: string } | null} billingAccess
 * @param {boolean} billingLive — isBillingLive() no cliente
 */
export function buildEffectiveCoreSteps(list, billingAccess, billingLive) {
  const arr = Array.isArray(list) ? list : [];
  const byId = new Map(arr.map((x) => [x.id, x]));
  const showTax =
    Boolean(billingLive) &&
    billingAccess &&
    billingAccess.status !== 'preview' &&
    billingAccess.accessLevel &&
    billingAccess.accessLevel !== 'none' &&
    billingAccess.companyTaxOk === false;

  const ids = ['first_lead', 'setup_ai', 'connect_whatsapp'];
  if (showTax) ids.push('company_tax');

  return ids.map((id) => {
    const row = byId.get(id);
    return {
      id,
      title: ONBOARDING_STEP_TITLES[id] || row?.title || 'Passo',
      done: Boolean(row?.done),
    };
  });
}

export function isEffectiveOnboardingComplete(list, billingAccess, billingLive) {
  const core = buildEffectiveCoreSteps(list, billingAccess, billingLive);
  return core.length > 0 && core.every((s) => s.done);
}

/** Rota sugerida por id do passo (null = só mensagem / sem navegação). */
export function onboardingStepPath(stepId) {
  const id = String(stepId || '').trim();
  switch (id) {
    case 'first_lead':
      return '/new-lead';
    case 'setup_ai':
      return '/agente-ia';
    case 'connect_whatsapp':
      return '/agente-ia';
    case 'company_tax':
      return '/empresa?focus=tax';
    case 'install_pwa':
      return null;
    default:
      return '/';
  }
}

export function onboardingDismissStorageKey(academyId) {
  return `navi_onboarding_dismissed_${String(academyId || '').trim()}`;
}

const MERGE_ORDER = [...DEFAULT_ORDER_IDS, 'company_tax'];

/**
 * Garante todos os passos padrão e marca ids como done.
 */
export function mergeOnboardingStepIdsDone(currentList, idsToComplete) {
  const want = new Set((idsToComplete || []).map((x) => String(x || '').trim()).filter(Boolean));
  const base = normalizeOnboardingChecklistList(
    Array.isArray(currentList) && currentList.length > 0 ? currentList : null
  );
  const byId = new Map(base.map((x) => [x.id, { ...x }]));

  for (const id of MERGE_ORDER) {
    if (!byId.has(id)) {
      const title = ONBOARDING_STEP_TITLES[id] || 'Passo';
      byId.set(id, { id, title, done: false });
    }
  }

  for (const id of want) {
    const row = byId.get(id);
    if (row) {
      row.done = true;
    } else {
      byId.set(id, {
        id,
        title: ONBOARDING_STEP_TITLES[id] || 'Passo',
        done: true,
      });
    }
  }

  const ordered = [];
  for (const id of MERGE_ORDER) {
    if (byId.has(id)) ordered.push(byId.get(id));
  }
  const rest = [...byId.keys()].filter((id) => !MERGE_ORDER.includes(id));
  for (const id of rest) {
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
