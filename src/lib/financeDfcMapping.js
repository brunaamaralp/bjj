/**
 * Mapeamento DFC (método direto) — FINANCIAL_TX → grupo de fluxo de caixa.
 *
 * Racional (aprovado 2026-07):
 * - **Operacional** — atividade principal da academia: mensalidades, vendas, CMV,
 *   despesas operacionais, tarifas bancárias, juros e taxas de cartão. Itens na
 *   linha "Resultado Financeiro" da DRE continuam aqui na DFC (são custos
 *   operacionais de meio de pagamento, não captação de capital).
 * - **Financiamento** — empréstimos, aportes de capital, distribuição de lucros,
 *   pró-labore e demais movimentos de capital/divida.
 * - **Investimento** — CAPEX / imobilizado (quando mapeado em contas).
 * - **Excluído** — transferências internas entre contas (`neutral`), CMV espelho
 *   sem caixa (`origin_type: sale_cmv`).
 *
 * O bucket legado `financial` em categorias (antes separado do operacional) mapeia
 * para Operacional na DFC — ver `dfcGroupForOperationalBucket`.
 */

import { operationalBucketForTx, resolveFinanceCategory } from './financeCategories.js';
import { findAccountByCode, parseAccountCategoryValue } from './financeAccountCategories.js';

export const DFC_GROUPS = {
  OPERATIONAL: 'Operacional',
  INVESTMENT: 'Investimento',
  FINANCING: 'Financiamento',
};

export const DFC_GROUP_ORDER = [
  DFC_GROUPS.OPERATIONAL,
  DFC_GROUPS.INVESTMENT,
  DFC_GROUPS.FINANCING,
];

const DFC_CLASSE_ALIASES = {
  operacional: DFC_GROUPS.OPERATIONAL,
  operational: DFC_GROUPS.OPERATIONAL,
  investimento: DFC_GROUPS.INVESTMENT,
  investment: DFC_GROUPS.INVESTMENT,
  financiamento: DFC_GROUPS.FINANCING,
  financing: DFC_GROUPS.FINANCING,
  caixa: DFC_GROUPS.OPERATIONAL,
};

const RESULT_ACCOUNT_TYPES = new Set(['receita', 'custo', 'despesa']);

/** Origens sem movimento de caixa na DFC direta. */
export const DFC_EXCLUDED_ORIGIN_TYPES = new Set(['sale_cmv']);

/**
 * Bucket gerencial → grupo DFC.
 * `financial` (legado) → Operacional, não Financiamento.
 */
export function dfcGroupForOperationalBucket(bucket) {
  const key = String(bucket || '').trim().toLowerCase();
  if (key === 'neutral') return null;
  if (key === 'financing') return DFC_GROUPS.FINANCING;
  if (key === 'investment' || key === 'investimento') return DFC_GROUPS.INVESTMENT;
  return DFC_GROUPS.OPERATIONAL;
}

export function normalizeDfcClasse(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return DFC_CLASSE_ALIASES[raw.toLowerCase()] || raw;
}

export function isDfcExcludedTx(doc) {
  const origin = String(doc?.origin_type || doc?.originType || '').toLowerCase();
  if (DFC_EXCLUDED_ORIGIN_TYPES.has(origin)) return true;
  return operationalBucketForTx(doc) === 'neutral';
}

/**
 * Grupo DFC para uma transação (método direto por categoria/conta).
 * @returns {string|null} Operacional | Investimento | Financiamento | null (excluído)
 */
export function dfcGroupForTx(doc, accounts = null) {
  if (isDfcExcludedTx(doc)) return null;

  const category = String(doc?.category || '').trim();
  const acctCode = parseAccountCategoryValue(category);
  if (acctCode && accounts?.length) {
    const account = findAccountByCode(accounts, acctCode);
    const dfcFromAccount = normalizeDfcClasse(account?.dfcClasse);
    if (dfcFromAccount && DFC_GROUP_ORDER.includes(dfcFromAccount)) {
      return dfcFromAccount;
    }
    const dre = String(account?.dreGrupo || '').trim();
    if (dre === 'Resultado Financeiro') return DFC_GROUPS.OPERATIONAL;
    const t = String(account?.type || '').toLowerCase();
    if (RESULT_ACCOUNT_TYPES.has(t)) return DFC_GROUPS.OPERATIONAL;
  }

  const cat = resolveFinanceCategory(category, accounts, {
    direction: String(doc?.direction || '').toLowerCase() === 'out' ? 'out' : 'in',
  });
  if (cat?.dreGroup === 'Resultado Financeiro') return DFC_GROUPS.OPERATIONAL;

  return dfcGroupForOperationalBucket(operationalBucketForTx(doc, accounts));
}

/** Default DFC para contas de resultado sem `dfcClasse` no backfill. */
export function defaultDfcClasseForAccountType(type, dreGrupo = '') {
  const t = String(type || '').trim().toLowerCase();
  const dre = String(dreGrupo || '').trim();
  if (!RESULT_ACCOUNT_TYPES.has(t)) return '';
  if (dre === 'Resultado Financeiro') return DFC_GROUPS.OPERATIONAL;
  return DFC_GROUPS.OPERATIONAL;
}

export function accountNeedsDfcBackfill(account) {
  const t = String(account?.type || '').trim().toLowerCase();
  if (!RESULT_ACCOUNT_TYPES.has(t)) return false;
  const dfc = normalizeDfcClasse(account?.dfcClasse);
  if (!dfc) return true;
  const dre = String(account?.dreGrupo || '').trim();
  if (dre === 'Resultado Financeiro' && dfc === DFC_GROUPS.FINANCING) return true;
  return false;
}
