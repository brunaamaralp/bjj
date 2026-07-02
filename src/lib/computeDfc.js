/**
 * DFC método direto — caixa por settledAt, base |net|, grupos por categoria.
 */

import {
  defaultCategoryForTxType,
  resolveFinanceCategory,
} from './financeCategories.js';
import {
  DFC_GROUP_ORDER,
  DFC_GROUPS,
  dfcGroupForTx,
  isDfcExcludedTx,
} from './financeDfcMapping.js';
import { normalizeStatementPeriod, ymdInInclusiveRange } from './financeStatementPeriod.js';
import { displayGross, displayNet, txDirection } from './financeTxDisplay.js';
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
    const resolved = resolveFinanceCategory(raw, accounts);
    if (resolved?.label) return resolved.isAccountCategory ? raw : resolved.label;
    return raw;
  }
  return defaultCategoryForTxType(tx?.type);
}

function cashMovementAmount(tx) {
  return displayNet(tx);
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

/**
 * @param {{ from?: string, to?: string, month?: string }} period
 * @param {object[]} txs
 * @param {object[]} [accounts]
 * @param {object} [bankBalances] — retorno de computeBankAccountBalances (mesmo período)
 */
export function computeDfc(period, txs = [], accounts = null, bankBalances = null) {
  const { from, to } = normalizeStatementPeriod(period);
  const groups = Object.fromEntries(DFC_GROUP_ORDER.map((g) => [g, emptyCategoryMap()]));

  let excludedSaleCmv = 0;
  let excludedNeutral = 0;
  let includedTxCount = 0;

  for (const tx of txs || []) {
    if (String(tx?.status || '').toLowerCase() !== 'settled') continue;
    const settledYmd = txSettledYmd(tx);
    if (!ymdInInclusiveRange(settledYmd, from, to)) continue;

    const origin = String(tx?.origin_type || tx?.originType || '').toLowerCase();
    if (origin === 'sale_cmv') {
      excludedSaleCmv += 1;
      continue;
    }
    if (isDfcExcludedTx(tx, accounts)) {
      excludedNeutral += 1;
      continue;
    }

    const dfcGroup = dfcGroupForTx(tx, accounts);
    if (!dfcGroup) {
      excludedNeutral += 1;
      continue;
    }

    includedTxCount += 1;
    const dir = txDirection(tx);
    const amount = cashMovementAmount(tx);
    const signed = dir === 'out' ? -amount : amount;
    const catKey = categoryLabelForTx(tx, accounts);
    const catLabel = resolveFinanceCategory(catKey, accounts)?.label || catKey;

    addFlow(groups[dfcGroup], catKey, catLabel, signed);
  }

  const built = {};
  let variacaoCaixa = 0;
  for (const name of DFC_GROUP_ORDER) {
    built[name] = buildGroupRow(groups[name]);
    variacaoCaixa = roundMoney(variacaoCaixa + built[name].net);
  }

  const saldoInicial = bankBalances ? sumBankBalancesOpening(bankBalances) : null;
  const saldoFinal = bankBalances ? sumBankBalancesFinal(bankBalances) : null;
  const fluxoLiquido = variacaoCaixa;
  const reconciliationOk =
    saldoInicial == null || saldoFinal == null
      ? null
      : Math.abs(roundMoney(saldoInicial + fluxoLiquido - saldoFinal)) < 0.02;

  return {
    period: { from, to },
    meta: {
      includedTxCount,
      excludedSaleCmv,
      excludedNeutral,
      base: 'net',
      method: 'direct',
    },
    groups: built,
    variacaoCaixa,
    bankReconciliation: {
      saldoInicial,
      saldoFinal,
      fluxoLiquido,
      matches: reconciliationOk,
    },
  };
}

export { DFC_GROUPS };
