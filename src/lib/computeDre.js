/**
 * DRE por competência — FINANCIAL_TX + plano de contas / categorias fixas.
 * Receita em GROSS; fee em entradas vira despesa financeira implícita (Opção A).
 */

import {
  UNCLASSIFIED_DRE_GROUP,
  defaultCategoryForTxType,
  resolveFinanceCategory,
} from './financeCategories.js';
import { effectiveCompetenceMonth, parseCompetenceMonth } from './financeCompetence.js';
import { normalizeStatementPeriod } from './financeStatementPeriod.js';
import { displayFee, displayGross, txDirection } from './financeTxDisplay.js';

const IMPLICIT_FEE_CATEGORY = 'Taxas de cartão (taxa implícita)';

const COMPUTED_LINES = [
  'Receita Líquida',
  'Lucro Bruto',
  'Resultado Operacional',
  'Resultado Líquido',
];

const DRE_GROUP_ORDER = [
  'Receita Bruta',
  'Deduções',
  'CMV/CPV',
  'Despesas Operacionais',
  'Depreciação/Amortização',
  'Resultado Financeiro',
  UNCLASSIFIED_DRE_GROUP,
  'Imposto s/ Lucro',
];

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

function dreGroupForTx(tx, accounts) {
  const label = categoryLabelForTx(tx, accounts);
  const cat = resolveFinanceCategory(label, accounts, {
    direction: txDirection(tx) === 'out' ? 'out' : 'in',
  });
  if (cat && !cat.dreGroup) return '';
  return cat?.dreGroup || UNCLASSIFIED_DRE_GROUP;
}

function isDreExcludedTx(tx, accounts) {
  if (String(tx?.status || '').toLowerCase() === 'cancelled') return true;
  const group = dreGroupForTx(tx, accounts);
  return !group;
}

function addCategoryAmount(map, key, label, amount) {
  if (!map.has(key)) map.set(key, { key, label, amount: 0 });
  const row = map.get(key);
  row.amount = roundMoney(row.amount + amount);
}

function buildGroupRow(categoryMap) {
  let total = 0;
  const categories = [];
  for (const row of categoryMap.values()) {
    total = roundMoney(total + row.amount);
    categories.push({ ...row, amount: roundMoney(row.amount) });
  }
  categories.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return { total: roundMoney(total), categories };
}

/**
 * @param {{ from?: string, to?: string, month?: string }} period
 * @param {object[]} txs
 * @param {object[]} [accounts] — plano de contas (coleção accounts)
 */
export function computeDre(period, txs = [], accounts = null) {
  const { from, to, months } = normalizeStatementPeriod(period);
  const monthSet = new Set(months);
  const groups = Object.fromEntries(DRE_GROUP_ORDER.map((g) => [g, emptyCategoryMap()]));

  let competenceFallbackCount = 0;
  let includedTxCount = 0;

  for (const tx of txs || []) {
    if (isDreExcludedTx(tx, accounts)) continue;

    const hadExplicit = Boolean(parseCompetenceMonth(tx?.competence_month));
    const ym = effectiveCompetenceMonth(tx);
    if (!ym || (monthSet.size > 0 && !monthSet.has(ym))) continue;

    if (!hadExplicit) competenceFallbackCount += 1;
    includedTxCount += 1;

    const dir = txDirection(tx);
    const gross = displayGross(tx);
    const fee = displayFee(tx);
    const group = dreGroupForTx(tx, accounts);
    const catKey = categoryLabelForTx(tx, accounts);
    const catLabel = resolveFinanceCategory(catKey, accounts)?.label || catKey;

    if (dir === 'in') {
      if (group === 'Resultado Financeiro') {
        addCategoryAmount(groups[group], catKey, catLabel, -gross);
      } else {
        addCategoryAmount(groups[group], catKey, catLabel, gross);
        if (fee > 0.009) {
          addCategoryAmount(
            groups['Resultado Financeiro'],
            IMPLICIT_FEE_CATEGORY,
            IMPLICIT_FEE_CATEGORY,
            fee
          );
        }
      }
    } else {
      addCategoryAmount(groups[group], catKey, catLabel, gross);
    }
  }

  const built = {};
  for (const [name, map] of Object.entries(groups)) {
    built[name] = buildGroupRow(map);
  }

  const receitaBruta = built['Receita Bruta'].total;
  const pctBase = receitaBruta > 0.009 ? receitaBruta : 0;

  for (const name of DRE_GROUP_ORDER) {
    built[name].categories = built[name].categories.map((c) => ({
      ...c,
      pctOfRevenue: pctBase > 0 ? roundMoney((c.amount / pctBase) * 100) : 0,
    }));
  }

  const deducoes = built['Deduções'].total;
  const cmv = built['CMV/CPV'].total;
  const despOp = built['Despesas Operacionais'].total;
  const deprec = built['Depreciação/Amortização'].total;
  const resFin = built['Resultado Financeiro'].total;
  const imposto = built['Imposto s/ Lucro'].total;
  const unclassified = built[UNCLASSIFIED_DRE_GROUP].total;

  const receitaLiquida = roundMoney(receitaBruta - deducoes);
  const lucroBruto = roundMoney(receitaLiquida - cmv);
  const resultadoOperacional = roundMoney(lucroBruto - despOp - deprec);
  const resultadoLiquido = roundMoney(resultadoOperacional - resFin - imposto - unclassified);

  const dreData = {
    'Receita Bruta': receitaBruta,
    Deduções: deducoes,
    'Receita Líquida': receitaLiquida,
    'CMV/CPV': cmv,
    'Lucro Bruto': lucroBruto,
    'Despesas Operacionais': despOp,
    'Depreciação/Amortização': deprec,
    'Resultado Operacional': resultadoOperacional,
    'Resultado Financeiro': resFin,
    [UNCLASSIFIED_DRE_GROUP]: unclassified,
    'Imposto s/ Lucro': imposto,
    'Resultado Líquido': resultadoLiquido,
  };

  return {
    period: { from, to, months },
    meta: {
      competenceFallbackCount,
      includedTxCount,
      implicitFeeCategory: IMPLICIT_FEE_CATEGORY,
    },
    groups: built,
    computed: Object.fromEntries(COMPUTED_LINES.map((k) => [k, dreData[k]])),
    dreData,
  };
}

export { IMPLICIT_FEE_CATEGORY };
