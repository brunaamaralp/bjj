import { filterBankAccountsWithBank } from './bankAccounts.js';
import { normalizeWhatsappRemindersConfig } from './financeWhatsappReminders.js';
import { paymentMethodsConfiguredSummary } from './paymentMethodSettings.js';
import {
  DEFAULT_OVERDUE_LABEL,
  DEFAULT_COLLECTION_RULES,
  parseCollectionRules,
  parseOverdueLabel,
  serializeCollectionRules,
} from './collectionRules.js';
import {
  DEFAULT_EXCEPTION_STATUS_LABELS,
  EXCEPTION_STATUS_KEYS,
  readExceptionStatusLabels,
} from './paymentExceptions.js';
import {
  feeReceiversAcquirerConfigured,
  feeReceiversSettingsSummary,
} from './feeReceivers.js';

/** Slugs em ?tab=financeiro&section= */
export const FINANCE_SETTINGS_SECTIONS = {
  PLANOS: 'planos',
  TAXAS: 'taxas',
  RECEBIMENTO: 'recebimento',
  FORMAS: 'formas-recebimento',
  FORNECEDORES: 'fornecedores',
  REGUA: 'regua',
  WHATSAPP: 'lembretes-whatsapp',
  EXCECOES: 'excecoes',
  PLANO_CONTAS: 'plano-contas',
  RAZAO: 'razao-contabil',
  CONTRATOS: 'contratos',
};

const VALID = new Set(Object.values(FINANCE_SETTINGS_SECTIONS));

export function isFinanceSettingsSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return VALID.has(id) ? id : null;
}

/** Seção padrão para titular (planos). */
export const FINANCE_DEFAULT_SECTION = FINANCE_SETTINGS_SECTIONS.PLANOS;

export function canAccessEmpresaFinanceSettings(role) {
  return role === 'owner' || role === 'admin';
}

/** Primeira seção ao abrir Financeiro conforme papel. */
export function getFinanceDefaultSection(isOwner) {
  return isOwner ? FINANCE_SETTINGS_SECTIONS.PLANOS : FINANCE_SETTINGS_SECTIONS.RECEBIMENTO;
}

/** Itens da sidebar (Minha Academia → Financeiro), filtrados por titular. */
export function buildFinanceSettingsNavItems(isOwner) {
  return FINANCE_SETTINGS_GROUPS.flatMap((group) =>
    group.items.filter((item) => !(item.ownerOnly && !isOwner))
  );
}

export const FINANCE_SETTINGS_GROUPS = [
  {
    id: 'essencial',
    label: 'Essencial',
    items: [
      {
        id: FINANCE_SETTINGS_SECTIONS.PLANOS,
        label: 'Planos de mensalidade',
        hint: 'Preços das mensalidades e vínculo com contratos',
        ownerOnly: true,
      },
      {
        id: FINANCE_SETTINGS_SECTIONS.RECEBIMENTO,
        label: 'Contas bancárias',
        hint: 'Banco, agência e PIX nos comprovantes',
      },
      {
        id: FINANCE_SETTINGS_SECTIONS.FORMAS,
        label: 'Formas de recebimento',
        hint: 'PIX, cartão e dinheiro — conta padrão e automações',
      },
      {
        id: FINANCE_SETTINGS_SECTIONS.FORNECEDORES,
        label: 'Fornecedores',
        hint: 'Água, luz, telefone — autocompletar em contas a pagar',
        ownerOnly: true,
      },
    ],
  },
  {
    id: 'recomendado',
    label: 'Recomendado',
    items: [
      {
        id: FINANCE_SETTINGS_SECTIONS.TAXAS,
        label: 'Taxas e recebedores',
        hint: 'Repasse ao aluno e taxas por maquininha/bandeira',
      },
      {
        id: FINANCE_SETTINGS_SECTIONS.REGUA,
        label: 'Régua de cobrança',
        hint: 'Lembretes e etiquetas após vencimento',
        ownerOnly: true,
      },
      {
        id: FINANCE_SETTINGS_SECTIONS.WHATSAPP,
        label: 'Lembretes WhatsApp',
        hint: 'Aviso automático antes e depois do vencimento',
      },
      {
        id: FINANCE_SETTINGS_SECTIONS.CONTRATOS,
        label: 'Modelos de contrato',
        hint: 'Textos para assinatura digital. Marque os planos de mensalidade em cada modelo.',
        ownerOnly: true,
      },
    ],
  },
  {
    id: 'avancado',
    label: 'Avançado',
    collapsible: true,
    items: [
      {
        id: FINANCE_SETTINGS_SECTIONS.EXCECOES,
        label: 'Status personalizados',
        hint: 'Rótulos de bolsa, cortesia e similares',
      },
      {
        id: FINANCE_SETTINGS_SECTIONS.PLANO_CONTAS,
        label: 'Plano de contas',
        hint: 'Subcontas de receita/despesa aparecem no lançamento; categorias fixas alimentam automações e DRE',
        ownerOnly: true,
      },
      {
        id: FINANCE_SETTINGS_SECTIONS.RAZAO,
        label: 'Razão contábil',
        hint: 'Partidas dobradas manuais e histórico por conta',
        ownerOnly: true,
      },
    ],
  },
];

export function financeSettingsSectionLabel(sectionId) {
  const id = String(sectionId || '').trim();
  for (const group of FINANCE_SETTINGS_GROUPS) {
    const item = group.items.find((entry) => entry.id === id);
    if (item) return item.label;
  }
  return 'Financeiro';
}

function formatBrl(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'R$ 0';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function feesSummary(cardFees) {
  const pix = Number(cardFees?.pix?.percent ?? 0);
  const deb = Number(cardFees?.debito?.percent ?? 0);
  const cre = Number(cardFees?.credito_avista?.percent ?? 0);
  const parcelado = cardFees?.credito_parcelado || {};
  const hasParcel = Object.values(parcelado).some((v) => Number(v) > 0);
  const parts = [`PIX ${pix}%`, `Déb. ${deb}%`, `Créd. ${cre}%`];
  if (hasParcel) parts.push('Parcelado');
  return parts.join(' · ');
}

/** Taxa configurada (percentual > 0 em algum método). Ignora `fixed` — só percent entra no cálculo. */
export function feesConfigured(cardFees) {
  const pix = Number(cardFees?.pix?.percent ?? 0);
  const deb = Number(cardFees?.debito?.percent ?? 0);
  const cre = Number(cardFees?.credito_avista?.percent ?? 0);
  const parcelado = cardFees?.credito_parcelado || {};
  const hasParcel = Object.values(parcelado).some((v) => Number(v) > 0);
  return pix > 0 || deb > 0 || cre > 0 || hasParcel;
}

function taxasSectionDone(financeConfig) {
  return feesConfigured(financeConfig?.cardFees) || feeReceiversAcquirerConfigured(financeConfig);
}

function taxasSectionSummary(financeConfig) {
  const parts = [];
  if (feesConfigured(financeConfig?.cardFees)) {
    parts.push(`Repasse ${feesSummary(financeConfig.cardFees)}`);
  }
  const receiversPart = feeReceiversSettingsSummary(financeConfig);
  if (receiversPart) parts.push(receiversPart);
  return parts.length ? parts.join(' · ') : 'Nenhuma taxa configurada';
}

export function collectionRulesConfigured(collectionRules, financeConfig) {
  const overdue = parseOverdueLabel(financeConfig?.overdueLabel ?? financeConfig?.overdue_label);
  if (overdue !== DEFAULT_OVERDUE_LABEL) return true;
  const persisted = financeConfig?.collectionRules ?? financeConfig?.collection_rules;
  if (persisted == null || persisted === '') return false;
  const rules =
    Array.isArray(collectionRules) && collectionRules.length > 0
      ? collectionRules
      : parseCollectionRules(persisted);
  return serializeCollectionRules(rules) !== serializeCollectionRules(DEFAULT_COLLECTION_RULES);
}

export function exceptionLabelsCustomized(financeConfig) {
  const current = readExceptionStatusLabels(financeConfig);
  return EXCEPTION_STATUS_KEYS.some((key) => current[key] !== DEFAULT_EXCEPTION_STATUS_LABELS[key]);
}

export function buildFinanceSettingsSummaries({ financeConfig, collectionRules, accountsCount, isOwner, contractTemplatesCount = 0 }) {
  const plans = financeConfig?.plans || [];
  const namedPlans = plans.filter((p) => String(p?.name || '').trim());
  const banks = filterBankAccountsWithBank(financeConfig?.bankAccounts);

  const planPrices = namedPlans
    .slice(0, 2)
    .map((p) => formatBrl(p.price))
    .join(', ');
  const plansSummary =
    namedPlans.length === 0
      ? 'Nenhum plano'
      : namedPlans.length === 1
        ? `${namedPlans[0].name} · ${formatBrl(namedPlans[0].price)}`
        : `${namedPlans.length} planos${planPrices ? ` · ${planPrices}${namedPlans.length > 2 ? '…' : ''}` : ''}`;

  const banksSummary =
    banks.length === 0
      ? 'Nenhuma conta'
      : banks.length === 1
        ? String(banks[0].bankName || banks[0].pixKey || '1 conta').trim()
        : `${banks.length} contas`;

  const rulesCount = Array.isArray(collectionRules) ? collectionRules.length : 0;
  const overdue = parseOverdueLabel(financeConfig?.overdueLabel ?? financeConfig?.overdue_label);
  const reguaConfigured = collectionRulesConfigured(collectionRules, financeConfig);
  const rulesPart = reguaConfigured
    ? `${rulesCount} etapa${rulesCount === 1 ? '' : 's'}`
    : 'Padrão do sistema';
  const wa = normalizeWhatsappRemindersConfig(financeConfig?.whatsappReminders);
  const waParts = [];
  if (wa.dueSoon.enabled) waParts.push(`antes (${wa.dueSoon.daysBefore}d)`);
  if (wa.overdue.enabled) waParts.push(`atraso (${wa.overdue.daysAfter}d)`);

  const vendors = financeConfig?.vendors || [];
  const namedVendors = vendors.filter((v) => String(v?.name || '').trim());
  const activeNamedVendors = namedVendors.filter((v) => v?.active !== false);
  const vendorsSummary =
    namedVendors.length === 0
      ? 'Nenhum cadastrado'
      : namedVendors.length === 1
        ? `${namedVendors[0].name}${namedVendors[0].defaultCategory ? ` · ${namedVendors[0].defaultCategory}` : ''}`
        : `${namedVendors.length} fornecedor(es)`;

  return {
    [FINANCE_SETTINGS_SECTIONS.PLANOS]: {
      done: namedPlans.length > 0,
      summary: plansSummary,
      hidden: !isOwner,
    },
    [FINANCE_SETTINGS_SECTIONS.RECEBIMENTO]: {
      done: banks.length > 0,
      summary: banksSummary,
    },
    [FINANCE_SETTINGS_SECTIONS.FORMAS]: {
      done: (() => {
        const { configured, active } = paymentMethodsConfiguredSummary(financeConfig);
        return active > 0 && configured === active;
      })(),
      summary: (() => {
        const { configured, active } = paymentMethodsConfiguredSummary(financeConfig);
        if (active === 0) return 'Nenhuma forma ativa';
        return `${configured}/${active} configurada${active === 1 ? '' : 's'}`;
      })(),
    },
    [FINANCE_SETTINGS_SECTIONS.FORNECEDORES]: {
      done: activeNamedVendors.length > 0,
      summary: vendorsSummary,
      hidden: !isOwner,
    },
    [FINANCE_SETTINGS_SECTIONS.TAXAS]: {
      done: taxasSectionDone(financeConfig),
      summary: taxasSectionSummary(financeConfig),
    },
    [FINANCE_SETTINGS_SECTIONS.REGUA]: {
      done: reguaConfigured,
      summary: `${rulesPart} · ${overdue}`,
      hidden: !isOwner,
    },
    [FINANCE_SETTINGS_SECTIONS.WHATSAPP]: {
      done: wa.dueSoon.enabled || wa.overdue.enabled,
      summary: waParts.length ? waParts.join(' · ') : 'Desativado',
    },
    [FINANCE_SETTINGS_SECTIONS.EXCECOES]: {
      done: exceptionLabelsCustomized(financeConfig),
      summary: exceptionLabelsCustomized(financeConfig)
        ? 'Rótulos personalizados'
        : 'Padrão do sistema',
    },
    [FINANCE_SETTINGS_SECTIONS.PLANO_CONTAS]: {
      done: (accountsCount || 0) > 0,
      summary: accountsCount > 0 ? `${accountsCount} conta${accountsCount === 1 ? '' : 's'}` : 'Não configurado',
      hidden: !isOwner,
    },
    [FINANCE_SETTINGS_SECTIONS.RAZAO]: {
      done: (accountsCount || 0) > 0,
      summary: 'Partidas dobradas e histórico',
      hidden: !isOwner,
    },
    [FINANCE_SETTINGS_SECTIONS.CONTRATOS]: {
      done: contractTemplatesCount > 0,
      summary:
        contractTemplatesCount === 0
          ? 'Nenhum modelo'
          : `${contractTemplatesCount} modelo${contractTemplatesCount === 1 ? '' : 's'}`,
      hidden: !isOwner,
    },
  };
}

export function financeSettingsProgress(summaries, { isOwner = true } = {}) {
  const coreIds = [
    FINANCE_SETTINGS_SECTIONS.PLANOS,
    FINANCE_SETTINGS_SECTIONS.RECEBIMENTO,
    FINANCE_SETTINGS_SECTIONS.TAXAS,
    FINANCE_SETTINGS_SECTIONS.REGUA,
  ].filter(
    (id) => isOwner || (id !== FINANCE_SETTINGS_SECTIONS.PLANOS && id !== FINANCE_SETTINGS_SECTIONS.REGUA)
  );
  const core = coreIds.map((id) => summaries[id]).filter(Boolean);
  const done = core.filter((s) => s.done).length;
  return { done, total: core.length };
}
