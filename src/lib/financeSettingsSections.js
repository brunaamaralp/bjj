import { filterBankAccountsWithBank } from './bankAccounts.js';

/** Slugs em ?tab=financeiro&section= */
export const FINANCE_SETTINGS_SECTIONS = {
  PLANOS: 'planos',
  TAXAS: 'taxas',
  RECEBIMENTO: 'recebimento',
  REGUA: 'regua',
  EXCECOES: 'excecoes',
  PLANO_CONTAS: 'plano-contas',
  CONTRATOS: 'contratos',
};

const VALID = new Set(Object.values(FINANCE_SETTINGS_SECTIONS));

export function isFinanceSettingsSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return VALID.has(id) ? id : null;
}

export const FINANCE_SETTINGS_GROUPS = [
  {
    id: 'essencial',
    label: 'Essencial',
    items: [
      {
        id: FINANCE_SETTINGS_SECTIONS.PLANOS,
        label: 'Planos de mensalidade',
        hint: 'Preços e duração das mensalidades',
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
      },
      {
        id: FINANCE_SETTINGS_SECTIONS.CONTRATOS,
        label: 'Modelos de contrato',
        hint: 'Templates para matrícula e rescisão',
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
        hint: 'Estrutura contábil e categorias',
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

  return {
    [FINANCE_SETTINGS_SECTIONS.PLANOS]: {
      done: namedPlans.length > 0,
      summary: plansSummary,
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
      summary: rulesCount > 0 ? `${rulesCount} etapa${rulesCount === 1 ? '' : 's'}` : 'Padrão',
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

export function financeSettingsProgress(summaries) {
  const core = [
    summaries[FINANCE_SETTINGS_SECTIONS.PLANOS],
    summaries[FINANCE_SETTINGS_SECTIONS.RECEBIMENTO],
    summaries[FINANCE_SETTINGS_SECTIONS.TAXAS],
    summaries[FINANCE_SETTINGS_SECTIONS.REGUA],
  ].filter(Boolean);
  const done = core.filter((s) => s.done).length;
  return { done, total: core.length };
}
