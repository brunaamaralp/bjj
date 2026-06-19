/**
 * Checklist de onboarding gravado em academia.onboardingChecklist (JSON).
 * No Appwrite o atributo costuma ser String(255): persistir com serializeOnboardingChecklistForDb
 * (só { id, done }); títulos vêm de ONBOARDING_STEP_TITLES em parse/normalize.
 * Passos principais: lead, IA, WhatsApp; fiscal (company_tax) condicional ao billing;
 * install_pwa é secundário (não entra na contagem principal).
 */

import { INTEGRACOES_WHATSAPP_PATH } from './integracoesRoutes.js';
import { AGENTE_IA_SETUP_PATH } from './agentIaRoutes.js';

export const ONBOARDING_STEP_TITLES = {
  first_lead: 'Criar seu primeiro lead',
  connect_whatsapp: 'Conectar o WhatsApp',
  setup_ai: 'Configurar o assistente de IA',
  setup_automations: 'Ativar automações do funil',
  setup_finance: 'Configurar financeiro',
  first_product: 'Cadastrar primeiro produto',
  first_stock_entry: 'Registrar estoque inicial',
  company_tax: 'Atualizar CPF/CNPJ da empresa',
  install_pwa: 'Instalar atalho no celular',
};

export const ONBOARDING_STEP_DESCRIPTIONS = {
  first_lead: 'Adicione um contato para acompanhar até a matrícula.',
  connect_whatsapp: 'Receba e responda mensagens pelo Nave.',
  setup_ai: 'Defina como o assistente atende seus contatos.',
  setup_automations: 'Os gatilhos começam desligados — ative mensagens automáticas do funil.',
  setup_finance: 'Adicione planos e configure as mensalidades.',
  first_product: 'Adicione produtos para usar nas vendas.',
  first_stock_entry: 'Informe as quantidades dos seus produtos.',
  company_tax: 'Dados fiscais para faturamento.',
  install_pwa: 'Atalho na tela inicial do celular.',
};

/** Ordem persistida por defeito (sem company_tax — injetado na UI quando necessário). */
export const DEFAULT_ONBOARDING_CHECKLIST = [
  { id: 'first_lead', title: ONBOARDING_STEP_TITLES.first_lead, done: false },
  { id: 'connect_whatsapp', title: ONBOARDING_STEP_TITLES.connect_whatsapp, done: false },
  { id: 'setup_ai', title: ONBOARDING_STEP_TITLES.setup_ai, done: false },
  { id: 'setup_automations', title: ONBOARDING_STEP_TITLES.setup_automations, done: false },
  { id: 'setup_finance', title: ONBOARDING_STEP_TITLES.setup_finance, done: false },
  { id: 'first_product', title: ONBOARDING_STEP_TITLES.first_product, done: false },
  { id: 'first_stock_entry', title: ONBOARDING_STEP_TITLES.first_stock_entry, done: false },
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

/** Contas bancárias overflow quando financeConfig (2500) não cabe — envelope JSON no mesmo atributo. */
export const ONBOARDING_FINANCE_BANKS_KEY = 'fba';

export const ONBOARDING_CHECKLIST_MAX_CHARS = 2048;

/** Gravação no Appwrite: JSON curto; envelope `{ steps, fba }` quando há contas no overflow financeiro. */
export function serializeOnboardingChecklistForDb(list, options = {}) {
  const norm = normalizeOnboardingChecklistList(Array.isArray(list) ? list : null);
  const compact = norm.map(({ id, done }) => ({ id, done: Boolean(done) }));
  const banks = options.financeBankAccounts;
  const preserveRaw = options.preserveRaw;
  const clearBanks = options.clearFinanceBankAccounts === true;
  let fba = Array.isArray(banks) && banks.length > 0 ? banks : null;
  if (!fba && !clearBanks && preserveRaw != null && preserveRaw !== '') {
    fba = extractFinanceBankAccountsFromOnboardingRaw(preserveRaw);
  }
  if (fba?.length) {
    return JSON.stringify({ steps: compact, fba });
  }
  return JSON.stringify(compact);
}

export function extractFinanceBankAccountsFromOnboardingRaw(raw) {
  if (raw == null || raw === '') return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const fba = parsed[ONBOARDING_FINANCE_BANKS_KEY] ?? parsed.financeBankAccounts;
      return Array.isArray(fba) ? fba : [];
    }
  } catch {
    void 0;
  }
  return [];
}

export function parseOnboardingChecklist(raw) {
  if (raw == null || raw === '') {
    return cloneDefault();
  }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.steps)) {
      return normalizeOnboardingChecklistList(parsed.steps);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return cloneDefault();
    }
    return normalizeOnboardingChecklistList(parsed);
  } catch {
    return cloneDefault();
  }
}

/** Passos que contam para “Faltam X de Y” e conclusão do banner principal. */
export const CORE_ONBOARDING_IDS = [
  'first_lead',
  'connect_whatsapp',
  'setup_ai',
  'setup_finance',
  'first_product',
  'first_stock_entry',
  'company_tax',
];

/** Só PWA; chips / dica separada. */
export const SECONDARY_ONBOARDING_IDS = ['install_pwa'];

/**
 * @param {Array<{id:string,title:string,done:boolean}>} list
 * @param {{ companyTaxOk?: boolean, accessLevel?: string } | null} billingAccess
 * @param {boolean} billingLive — isBillingLive() no cliente
 */
/**
 * @param {object} [ctx]
 * @param {object} [ctx.modules] — { finance, sales, inventory }
 * @param {object|null} [ctx.financeConfig]
 * @param {boolean} [ctx.hasProducts]
 * @param {boolean} [ctx.hasStockMoves]
 */
export function buildEffectiveCoreSteps(list, billingAccess, billingLive, ctx = {}) {
  const arr = Array.isArray(list) ? list : [];
  const byId = new Map(arr.map((x) => [x.id, x]));
  const modules = ctx.modules || {};
  const showTax =
    Boolean(billingLive) &&
    billingAccess &&
    billingAccess.status !== 'preview' &&
    billingAccess.accessLevel &&
    billingAccess.accessLevel !== 'none' &&
    billingAccess.companyTaxOk === false;

  const ids = ['first_lead', 'connect_whatsapp', 'setup_ai'];
  if (modules.finance) ids.push('setup_finance');
  if (modules.sales || modules.inventory) ids.push('first_product');
  if (modules.inventory) ids.push('first_stock_entry');
  if (showTax) ids.push('company_tax');

  const computedDone = {
    setup_finance: (ctx.financeConfig?.plans?.length || 0) > 0,
    first_product: Boolean(ctx.hasProducts),
    first_stock_entry: Boolean(ctx.hasStockMoves),
  };

  return ids.map((id) => {
    const row = byId.get(id);
    const persisted = Boolean(row?.done);
    const auto = Boolean(computedDone[id]);
    return {
      id,
      title: ONBOARDING_STEP_TITLES[id] || row?.title || 'Passo',
      description: ONBOARDING_STEP_DESCRIPTIONS[id] || '',
      done: persisted || auto,
    };
  });
}

export function isEffectiveOnboardingComplete(list, billingAccess, billingLive, ctx = {}) {
  const core = buildEffectiveCoreSteps(list, billingAccess, billingLive, ctx);
  return core.length > 0 && core.every((s) => s.done);
}

export function isOnboardingStepDone(list, stepId) {
  const arr = Array.isArray(list) ? list : [];
  const id = String(stepId || '').trim();
  if (!id) return false;
  return Boolean(arr.find((x) => x.id === id)?.done);
}

/** Rota sugerida por id do passo (null = só mensagem / sem navegação). */
export function onboardingStepPath(stepId) {
  const id = String(stepId || '').trim();
  switch (id) {
    case 'first_lead':
      return '/new-lead';
    case 'setup_ai':
      return AGENTE_IA_SETUP_PATH;
    case 'connect_whatsapp':
      return INTEGRACOES_WHATSAPP_PATH;
    case 'setup_automations':
      return '/automacoes?wizard=1';
    case 'setup_finance':
      return '/empresa?tab=financeiro';
    case 'first_product':
      return '/loja?tab=produtos';
    case 'first_stock_entry':
      return '/loja?tab=estoque';
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

const MERGE_ORDER = [
  ...DEFAULT_ORDER_IDS,
  'company_tax',
];

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
