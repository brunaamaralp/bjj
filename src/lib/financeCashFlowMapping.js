/**

 * Fluxo de caixa gerencial (cascata) — FINANCIAL_TX → linha gerencial.

 * Extende o de-para DRE/DFC sem alterar dfcGroupForTx / dreGroupForTx.

 *

 * Princípio: cashFlowClass vem da categoria (ou override explícito da conta).

 * Sem inferência por dreGroup, type, valor ou pagador.

 */



import { resolveFinanceCategory } from './financeCategories.js';

import { findAccountByCode, parseAccountCategoryValue } from './financeAccountCategories.js';

import { isDfcExcludedTx } from './financeDfcMapping.js';

import { txDirection } from './financeTxDisplay.js';



export const CASH_FLOW_CLASS = {

  RECEITA_SERVICO: 'receita_servico',

  RECEITA_PRODUTO: 'receita_produto',

  DESP_VARIAVEL: 'desp_variavel',

  DESP_FIXA: 'desp_fixa',

  INVESTIMENTO: 'investimento',

  PGTO_EMPRESTIMO: 'pgto_emprestimo',

  PGTO_FORNECEDOR: 'pgto_fornecedor',

  TOMADA_EMPRESTIMO: 'tomada_emprestimo',

  INJECAO_SOCIO: 'injecao_socio',

  RETIRADA_SOCIO: 'retirada_socio',

  RECEITA_TERCEIRO: 'receita_terceiro',

  DESPESA_TERCEIRO: 'despesa_terceiro',

  NAO_CLASSIFICADO: 'nao_classificado',

};



/** Linhas de detalhe (exclui subtotais calculados). */

export const CASCADE_DETAIL_CLASS_ORDER = [

  CASH_FLOW_CLASS.RECEITA_SERVICO,

  CASH_FLOW_CLASS.RECEITA_PRODUTO,

  CASH_FLOW_CLASS.DESP_VARIAVEL,

  CASH_FLOW_CLASS.DESP_FIXA,

  CASH_FLOW_CLASS.INVESTIMENTO,

  CASH_FLOW_CLASS.PGTO_EMPRESTIMO,

  CASH_FLOW_CLASS.PGTO_FORNECEDOR,

  CASH_FLOW_CLASS.TOMADA_EMPRESTIMO,

  CASH_FLOW_CLASS.INJECAO_SOCIO,

  CASH_FLOW_CLASS.RETIRADA_SOCIO,

  CASH_FLOW_CLASS.RECEITA_TERCEIRO,

  CASH_FLOW_CLASS.DESPESA_TERCEIRO,

  CASH_FLOW_CLASS.NAO_CLASSIFICADO,

];



export const CASCADE_COMPUTED_LINES = [

  'resultado_operacional',

  'resultado_patrimonial',

  'resultado_final',

  'variacao_classificada',

];



const SERVICE_TX_TYPES = new Set(['plan', 'enrollment']);

const PRODUCT_TX_TYPES = new Set(['product']);



const CASH_FLOW_ALIASES = {

  receita_servico: CASH_FLOW_CLASS.RECEITA_SERVICO,

  receita_produto: CASH_FLOW_CLASS.RECEITA_PRODUTO,

  desp_variavel: CASH_FLOW_CLASS.DESP_VARIAVEL,

  desp_fixa: CASH_FLOW_CLASS.DESP_FIXA,

  investimento: CASH_FLOW_CLASS.INVESTIMENTO,

  pgto_emprestimo: CASH_FLOW_CLASS.PGTO_EMPRESTIMO,

  pgto_fornecedor: CASH_FLOW_CLASS.PGTO_FORNECEDOR,

  tomada_emprestimo: CASH_FLOW_CLASS.TOMADA_EMPRESTIMO,

  injecao_socio: CASH_FLOW_CLASS.INJECAO_SOCIO,

  retirada_socio: CASH_FLOW_CLASS.RETIRADA_SOCIO,

  receita_terceiro: CASH_FLOW_CLASS.RECEITA_TERCEIRO,

  despesa_terceiro: CASH_FLOW_CLASS.DESPESA_TERCEIRO,

  nao_classificado: CASH_FLOW_CLASS.NAO_CLASSIFICADO,

};



export function normalizeCashFlowClass(value) {

  const raw = String(value || '').trim();

  if (!raw) return '';

  const key = raw.toLowerCase();

  return CASH_FLOW_ALIASES[key] || raw;

}



export function isCascadeExcludedTx(doc, accounts = null) {

  return isDfcExcludedTx(doc, accounts);

}



function cashFlowFromCategory(cat) {

  if (!cat?.cashFlowClass) return '';

  return normalizeCashFlowClass(cat.cashFlowClass);

}



/**

 * @returns {string} cash flow class key

 */

export function cashFlowClassForTx(doc, accounts = null) {

  if (isCascadeExcludedTx(doc, accounts)) return '';



  const category = String(doc?.category || '').trim();

  const acctCode = parseAccountCategoryValue(category);

  if (acctCode && accounts?.length) {

    const account = findAccountByCode(accounts, acctCode);

    const fromAccount = normalizeCashFlowClass(account?.cashFlowClass);

    if (fromAccount && CASCADE_DETAIL_CLASS_ORDER.includes(fromAccount)) {

      return fromAccount;

    }

  }



  const cat = resolveFinanceCategory(category, accounts, {

    direction: txDirection(doc) === 'out' ? 'out' : 'in',

  });

  const fromCat = cashFlowFromCategory(cat);

  if (fromCat) return fromCat;



  if (cat?.cascadeSplitRevenue) return '';



  return CASH_FLOW_CLASS.NAO_CLASSIFICADO;

}



/** Receita operacional splitada serviço/produto por proporção do período (só categorias marcadas). */

export function isPooledOperationalRevenueTx(doc, accounts = null) {

  if (txDirection(doc) !== 'in') return false;

  if (isCascadeExcludedTx(doc, accounts)) return false;



  const cat = resolveFinanceCategory(String(doc?.category || '').trim(), accounts, { direction: 'in' });

  if (!cat?.cascadeSplitRevenue) return false;



  const type = String(doc?.type || cat.type || '').toLowerCase();

  if (SERVICE_TX_TYPES.has(type) || PRODUCT_TX_TYPES.has(type)) return false;



  return true;

}



export const FINANCE_CASH_FLOW_CLASS_OPTIONS = [

  { value: '', label: '(herdar categoria)' },

  { value: CASH_FLOW_CLASS.RECEITA_SERVICO, label: 'Receita — serviços' },

  { value: CASH_FLOW_CLASS.RECEITA_PRODUTO, label: 'Receita — produtos' },

  { value: CASH_FLOW_CLASS.DESP_VARIAVEL, label: 'Despesa variável' },

  { value: CASH_FLOW_CLASS.DESP_FIXA, label: 'Despesa fixa' },

  { value: CASH_FLOW_CLASS.INVESTIMENTO, label: 'Investimento' },

  { value: CASH_FLOW_CLASS.PGTO_EMPRESTIMO, label: 'Pagamento de empréstimo' },

  { value: CASH_FLOW_CLASS.PGTO_FORNECEDOR, label: 'Pagamento de fornecedor' },

  { value: CASH_FLOW_CLASS.TOMADA_EMPRESTIMO, label: 'Tomada de empréstimo' },

  { value: CASH_FLOW_CLASS.INJECAO_SOCIO, label: 'Injeção de sócios' },

  { value: CASH_FLOW_CLASS.RETIRADA_SOCIO, label: 'Retirada de sócios / pró-labore' },

  { value: CASH_FLOW_CLASS.RECEITA_TERCEIRO, label: 'Receita de terceiros' },

  { value: CASH_FLOW_CLASS.DESPESA_TERCEIRO, label: 'Despesa de terceiros' },

];


