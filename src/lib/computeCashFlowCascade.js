/**
 * Fluxo de caixa gerencial (cascata) — regime de caixa, mesma base da DFC.
 */

import {
  defaultCategoryForTxType,
  resolveFinanceCategory,
} from './financeCategories.js';
import {
  CASH_FLOW_CLASS,
  CASCADE_DETAIL_CLASS_ORDER,
  cashFlowClassForTx,
  isCascadeExcludedTx,
  isPooledOperationalRevenueTx,
} from './financeCashFlowMapping.js';
import {
  allocatePooledRevenue,
  computeCashRevenueSplitRatio,
} from './cashFlowRevenueSplit.js';
import { normalizeStatementPeriod, ymdInInclusiveRange } from './financeStatementPeriod.js';
import { displayNet, txDirection } from './financeTxDisplay.js';
import { txSettledYmd } from './bankAccountBalances.js';

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function emptyCategoryMap() {
  return new Map();
}

function categoryLabelForTx(tx, accounts) {
  const raw = String(tx?.category || '').trim();
  if (raw) {
    const resolved = resolveFinanceCategory(raw, accounts, {
      direction: txDirection(tx) === 'out' ? 'out' : 'in',
    });
    if (resolved?.label) return resolved.isAccountCategory ? raw : resolved.label;
    return raw;
  }
  return defaultCategoryForTxType(tx?.type);
}

function addFlow(map, key, label, signedAmount) {
  if (!map.has(key)) {
    map.set(key, { key, label, inflow: 0, outflow: 0, net: 0 });
  }
  const row = map.get(key);
  if (signedAmount >= 0) row.inflow = roundMoney(row.inflow + signedAmount);
  else row.outflow = roundMoney(row.outflow + Math.abs(signedAmount));
  row.net = roundMoney(row.net + signedAmount);
}

function buildGroupRow(categoryMap) {
  let inflow = 0;
  let outflow = 0;
  let net = 0;
  const categories = [];
  for (const row of categoryMap.values()) {
    inflow = roundMoney(inflow + row.inflow);
    outflow = roundMoney(outflow + row.outflow);
    net = roundMoney(net + row.net);
    categories.push({ ...row });
  }
  categories.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return { inflow, outflow, net, categories };
}

function sumBankBalancesOpening(bankBalances) {
  const accounts = bankBalances?.accounts || [];
  const unalloc = Number(bankBalances?.unallocated?.openingBalance) || 0;
  const accSum = accounts.reduce((s, a) => s + (Number(a.openingBalance) || 0), 0);
  return roundMoney(accSum + unalloc);
}

function sumBankBalancesFinal(bankBalances) {
  return roundMoney(Number(bankBalances?.totalBalance) || 0);
}
function filterPeriodSettledTxs(period, txs) {
  const { from, to } = normalizeStatementPeriod(period);
  const inPeriod = [];
  for (const tx of txs || []) {
    if (String(tx?.status || '').toLowerCase() !== 'settled') continue;
    const settledYmd = txSettledYmd(tx);
    if (!ymdInInclusiveRange(settledYmd, from, to)) continue;
    const origin = String(tx?.origin_type || tx?.originType || '').toLowerCase();
    if (origin === 'sale_cmv') continue;
    inPeriod.push(tx);
  }
  return { from, to, inPeriod };
}

/**
 * @param {{ from?: string, to?: string, month?: string }} period
 * @param {object[]} txs
 * @param {object[]} [accounts]
 * @param {object} [bankBalances]
 */
export function computeCashFlowCascade(period, txs = [], accounts = null, bankBalances = null) {
  const { from, to, inPeriod } = filterPeriodSettledTxs(period, txs);
  const groups = Object.fromEntries(
    CASCADE_DETAIL_CLASS_ORDER.map((g) => [g, emptyCategoryMap()])
  );

  const revenueRatio = computeCashRevenueSplitRatio(inPeriod, accounts);
  let excludedNeutral = 0;
  let includedTxCount = 0;
  let pooledSplitCount = 0;

  for (const tx of inPeriod) {
    if (isCascadeExcludedTx(tx, accounts)) {
      excludedNeutral += 1;
      continue;
    }

    const dir = txDirection(tx);
    const amount = displayNet(tx);
    const signed = dir === 'out' ? -amount : amount;
    const catKey = categoryLabelForTx(tx, accounts);
    const resolved = resolveFinanceCategory(catKey, accounts);
    const catLabel = resolved?.label || catKey;
    const flowKey = resolved?.isAccountCategory ? catKey : catLabel;

    if (isPooledOperationalRevenueTx(tx, accounts)) {
      pooledSplitCount += 1;
      const { service, product } = allocatePooledRevenue(amount, revenueRatio);
      if (service > 0.009) {
        addFlow(groups[CASH_FLOW_CLASS.RECEITA_SERVICO], `${flowKey}:svc`, catLabel, service);
      }
      if (product > 0.009) {
        addFlow(groups[CASH_FLOW_CLASS.RECEITA_PRODUTO], `${flowKey}:prd`, catLabel, product);
      }
      includedTxCount += 1;
      continue;
    }

    const cls = cashFlowClassForTx(tx, accounts);
    if (!cls || !groups[cls]) {
      excludedNeutral += 1;
      continue;
    }

    includedTxCount += 1;
    addFlow(groups[cls], flowKey, catLabel, signed);
  }

  const lines = {};
  for (const name of CASCADE_DETAIL_CLASS_ORDER) {
    lines[name] = buildGroupRow(groups[name]);
  }

  const receitaServico = lines[CASH_FLOW_CLASS.RECEITA_SERVICO].net;
  const receitaProduto = lines[CASH_FLOW_CLASS.RECEITA_PRODUTO].net;
  const receitaTotal = roundMoney(receitaServico + receitaProduto);

  const despVariavel = lines[CASH_FLOW_CLASS.DESP_VARIAVEL].net;
  const despFixa = lines[CASH_FLOW_CLASS.DESP_FIXA].net;

  const resultadoOperacional = roundMoney(
    receitaTotal + despVariavel + despFixa
  );

  const investimento = lines[CASH_FLOW_CLASS.INVESTIMENTO].net;
  const pgtoEmprestimo = lines[CASH_FLOW_CLASS.PGTO_EMPRESTIMO].net;
  const pgtoFornecedor = lines[CASH_FLOW_CLASS.PGTO_FORNECEDOR].net;

  const resultadoPatrimonial = roundMoney(
    resultadoOperacional + investimento + pgtoEmprestimo + pgtoFornecedor
  );

  const tomadaEmprestimo = lines[CASH_FLOW_CLASS.TOMADA_EMPRESTIMO].net;
  const injecaoSocio = lines[CASH_FLOW_CLASS.INJECAO_SOCIO].net;
  const retiradaSocio = lines[CASH_FLOW_CLASS.RETIRADA_SOCIO].net;

  const resultadoFinal = roundMoney(
    resultadoPatrimonial + tomadaEmprestimo + injecaoSocio + retiradaSocio
  );

  const receitaTerceiro = lines[CASH_FLOW_CLASS.RECEITA_TERCEIRO].net;
  const despesaTerceiro = lines[CASH_FLOW_CLASS.DESPESA_TERCEIRO].net;
  const naoClassificado = lines[CASH_FLOW_CLASS.NAO_CLASSIFICADO].net;

  const variacaoClassificada = roundMoney(
    resultadoFinal + receitaTerceiro + despesaTerceiro + naoClassificado
  );

  const saldoInicial = bankBalances ? sumBankBalancesOpening(bankBalances) : null;
  const saldoFinal = bankBalances ? sumBankBalancesFinal(bankBalances) : null;
  const variacaoSaldo =
    saldoInicial != null && saldoFinal != null ? roundMoney(saldoFinal - saldoInicial) : null;

  const reconciliationOk =
    variacaoSaldo == null
      ? null
      : Math.abs(roundMoney(variacaoClassificada - variacaoSaldo)) < 0.02;

  const cascadeData = {
    receita_servico: receitaServico,
    receita_produto: receitaProduto,
    receita_total: receitaTotal,
    desp_variavel: despVariavel,
    desp_fixa: despFixa,
    resultado_operacional: resultadoOperacional,
    investimento,
    pgto_emprestimo: pgtoEmprestimo,
    pgto_fornecedor: pgtoFornecedor,
    resultado_patrimonial: resultadoPatrimonial,
    tomada_emprestimo: tomadaEmprestimo,
    injecao_socio: injecaoSocio,
    retirada_socio: retiradaSocio,
    resultado_final: resultadoFinal,
    receita_terceiro: receitaTerceiro,
    despesa_terceiro: despesaTerceiro,
    nao_classificado: naoClassificado,
    variacao_classificada: variacaoClassificada,
    variacao_saldo: variacaoSaldo,
  };

  return {
    period: { from, to },
    meta: {
      includedTxCount,
      excludedNeutral,
      pooledSplitCount,
      revenueSplit: revenueRatio,
      base: 'net',
      method: 'cascade',
    },
    lines,
    cascadeData,
    bankReconciliation: {
      saldoInicial,
      saldoFinal,
      variacaoSaldo,
      fluxoClassificado: variacaoClassificada,
      gap: variacaoSaldo != null ? roundMoney(variacaoClassificada - variacaoSaldo) : null,
      matches: reconciliationOk,
    },
  };
}

export { CASH_FLOW_CLASS, CASCADE_DETAIL_CLASS_ORDER };
