/**
 * Exportação CSV dos demonstrativos DRE/DFC.
 */
import { DRE_DISPLAY_GROUPS, UNCLASSIFIED_DRE_GROUP } from './financeCategories.js';
import { DFC_GROUP_ORDER } from './financeDfcMapping.js';
import {
  CASCADE_DISPLAY_ROWS,
  cascadeRowAmount,
  cascadeRowCategories,
} from './financeCascadeDisplay.js';

const DRE_TOTAL_LINES = new Set([
  'Receita Líquida',
  'Lucro Bruto',
  'Resultado Operacional',
  'Resultado Líquido',
]);

function csvMoney(n) {
  return Number(n || 0).toFixed(2).replace('.', ',');
}

function dreLineAmount(statement, groupName) {
  const isTotal = DRE_TOTAL_LINES.has(groupName);
  if (isTotal) return Number(statement?.dreData?.[groupName] || 0);
  return Number(statement?.groups?.[groupName]?.total ?? statement?.dreData?.[groupName] ?? 0);
}

/** @param {object} apiResponse — retorno de fetchFinanceDre */
export function buildDreCsvMatrix(apiResponse) {
  const statement = apiResponse?.statement;
  const delta = apiResponse?.delta;
  const month = apiResponse?.month || '';
  const headers = ['Grupo', 'Categoria', 'Valor (R$)', 'vs mês ant. (R$)'];
  const rows = [];

  if (!statement?.dreData) return { headers, rows, filename: `dre-${month || 'periodo'}.csv` };

  for (const groupName of DRE_DISPLAY_GROUPS) {
    if (groupName === 'EBITDA' || statement.dreData[groupName] === undefined) continue;
    const groupTotal = dreLineAmount(statement, groupName);
    const categories = DRE_TOTAL_LINES.has(groupName)
      ? []
      : statement.groups?.[groupName]?.categories || [];
    const visibleCats = categories.filter((c) => Math.abs(Number(c.amount || 0)) > 0.009);

    if (visibleCats.length === 0) {
      if (Math.abs(groupTotal) > 0.009 || DRE_TOTAL_LINES.has(groupName)) {
        rows.push([groupName, '', csvMoney(groupTotal), csvMoney(delta?.lines?.[groupName])]);
      }
      continue;
    }

    rows.push([groupName, '(total)', csvMoney(groupTotal), csvMoney(delta?.lines?.[groupName])]);
    for (const cat of visibleCats) {
      rows.push([
        groupName,
        cat.label,
        csvMoney(cat.amount),
        cat.pctOfRevenue != null ? `${Number(cat.pctOfRevenue).toFixed(1)}% RB` : '',
      ]);
    }
  }

  if (Math.abs(Number(statement.dreData[UNCLASSIFIED_DRE_GROUP] || 0)) > 0.009) {
    /* já incluído no loop */
  }

  return { headers, rows, filename: `dre-${month || 'periodo'}.csv` };
}

/** @param {object} apiResponse — retorno de fetchFinanceDfc */
export function buildDfcCsvMatrix(apiResponse) {
  const statement = apiResponse?.statement;
  const delta = apiResponse?.delta;
  const month = apiResponse?.month || '';
  const headers = ['Grupo', 'Categoria', 'Entradas (R$)', 'Saídas (R$)', 'Líquido (R$)', 'vs mês ant. (R$)'];
  const rows = [];

  if (!statement?.groups) {
    return { headers, rows, filename: `dfc-${month || 'periodo'}.csv` };
  }

  for (const groupName of DFC_GROUP_ORDER) {
    const group = statement.groups[groupName];
    if (!group) continue;
    const cats = (group.categories || []).filter((c) => Math.abs(Number(c.net || 0)) > 0.009);
    const hasGroup =
      Math.abs(Number(group.net || 0)) > 0.009 ||
      Math.abs(Number(group.inflow || 0)) > 0.009 ||
      Math.abs(Number(group.outflow || 0)) > 0.009;

    if (!hasGroup && cats.length === 0) continue;

    rows.push([
      groupName,
      '(total)',
      csvMoney(group.inflow),
      csvMoney(group.outflow),
      csvMoney(group.net),
      csvMoney(delta?.groups?.[groupName]?.net),
    ]);

    for (const cat of cats) {
      rows.push([
        groupName,
        cat.label,
        csvMoney(cat.inflow),
        csvMoney(cat.outflow),
        csvMoney(cat.net),
        '',
      ]);
    }
  }

  rows.push([
    'Variação de caixa',
    '',
    '',
    '',
    csvMoney(statement.variacaoCaixa),
    csvMoney(delta?.lines?.variacaoCaixa),
  ]);

  return { headers, rows, filename: `dfc-${month || 'periodo'}.csv` };
}

/** @param {object} apiResponse — retorno de fetchFinanceCascade */
export function buildCascadeCsvMatrix(apiResponse) {
  const statement = apiResponse?.statement;
  const delta = apiResponse?.delta;
  const month = apiResponse?.month || '';
  const headers = ['Linha', 'Categoria', 'Valor (R$)', 'vs mês ant. (R$)'];
  const rows = [];

  if (!statement?.cascadeData) {
    return { headers, rows, filename: `cascata-${month || 'periodo'}.csv` };
  }

  for (const row of CASCADE_DISPLAY_ROWS) {
    const amount = cascadeRowAmount(statement, row);
    if (row.kind === 'detail' && Math.abs(Number(amount || 0)) < 0.009) {
      const cats = cascadeRowCategories(statement, row);
      if (!cats.length) continue;
    }
    if (row.kind !== 'detail' && amount == null) continue;

    rows.push([row.label, '', csvMoney(amount), csvMoney(delta?.lines?.[row.key])]);

    if (row.kind !== 'detail') continue;
    const cats = cascadeRowCategories(statement, row).filter(
      (c) => Math.abs(Number(c.net || 0)) > 0.009
    );
    for (const cat of cats) {
      rows.push([row.label, cat.label, csvMoney(cat.net), '']);
    }
  }

  return { headers, rows, filename: `cascata-${month || 'periodo'}.csv` };
}
