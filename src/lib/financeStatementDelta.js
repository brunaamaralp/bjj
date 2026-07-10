/**
 * Delta absoluto (R$) entre dois demonstrativos do mesmo tipo.
 */

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/** @param {ReturnType<import('./computeDre.js').computeDre>} current */
export function buildDreCompareDelta(current, compare) {
  const lines = {};
  for (const key of Object.keys(current?.dreData || {})) {
    lines[key] = roundMoney(
      (current.dreData[key] || 0) - (compare?.dreData?.[key] || 0)
    );
  }
  const groups = {};
  for (const [name, group] of Object.entries(current?.groups || {})) {
    groups[name] = {
      total: roundMoney((group?.total || 0) - (compare?.groups?.[name]?.total || 0)),
    };
  }
  return { lines, groups };
}

/** @param {ReturnType<import('./computeDfc.js').computeDfc>} current */
export function buildDfcCompareDelta(current, compare) {
  const lines = {
    variacaoCaixa: roundMoney(
      (current?.variacaoCaixa || 0) - (compare?.variacaoCaixa || 0)
    ),
  };
  const groups = {};
  for (const [name, group] of Object.entries(current?.groups || {})) {
    groups[name] = {
      net: roundMoney((group?.net || 0) - (compare?.groups?.[name]?.net || 0)),
    };
  }
  return { lines, groups };
}

/** @param {ReturnType<import('./computeCashFlowCascade.js').computeCashFlowCascade>} current */
export function buildCascadeCompareDelta(current, compare) {
  const lines = {};
  for (const key of Object.keys(current?.cascadeData || {})) {
    lines[key] = roundMoney(
      (current.cascadeData[key] || 0) - (compare?.cascadeData?.[key] || 0)
    );
  }
  return { lines };
}
