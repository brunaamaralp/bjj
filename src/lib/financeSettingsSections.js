import { filterBankAccountsWithBank } from './bankAccounts.js';
import { normalizeWhatsappRemindersConfig } from './financeWhatsappReminders.js';
import { parseOverdueLabel } from './collectionRules.js';

/** Slugs em ?tab=financeiro&section= */
export const FINANCE_SETTINGS_SECTIONS = {
  PLANOS: 'planos',
  TAXAS: 'taxas',
  RECEBIMENTO: 'recebimento',
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
        label: 'Contas para recebimento',
        hint: 'Banco, agência e PIX nos comprovantes',
      },
    ],
  },
  {
    id: 'recomendado',
    label: 'Recomendado',
    items: [
      {
        id: FINANCE_SETTINGS_SECTIONS.TAXAS,
        label: 'Taxas de cartão',
        hint: 'Descontos em PIX, débito e crédito',
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
  const rulesPart =
    rulesCount > 0 ? `${rulesCount} etapa${rulesCount === 1 ? '' : 's'}` : 'Padrão';
  const wa = normalizeWhatsappRemindersConfig(financeConfig?.whatsappReminders);
  const waParts = [];
  if (wa.dueSoon.enabled) waParts.push(`antes (${wa.dueSoon.daysBefore}d)`);
  if (wa.overdue.enabled) waParts.push(`atraso (${wa.overdue.daysAfter}d)`);

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
    [FINANCE_SETTINGS_SECTIONS.TAXAS]: {
      done: true,
      summary: feesSummary(financeConfig?.cardFees),
    },
    [FINANCE_SETTINGS_SECTIONS.REGUA]: {
      done: rulesCount > 0,
      summary: `${rulesPart} · ${overdue}`,
      hidden: !isOwner,
    },
    [FINANCE_SETTINGS_SECTIONS.WHATSAPP]: {
      done: wa.dueSoon.enabled || wa.overdue.enabled,
      summary: waParts.length ? waParts.join(' · ') : 'Desativado',
    },
    [FINANCE_SETTINGS_SECTIONS.EXCECOES]: {
      done: true,
      summary: 'Personalização opcional',
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
