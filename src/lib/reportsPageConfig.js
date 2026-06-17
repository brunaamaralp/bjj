export const REPORT_TABS = new Set([
  'funil',
  'alunos',
  'financeiro',
  'loja',
  'estoque',
  'atividade',
]);

export const REPORT_TAB_ITEMS_BASE = [
  { id: 'funil', label: 'Funil' },
  { id: 'alunos', label: 'Alunos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'loja', label: 'Vendas' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'atividade', label: 'Atividade' },
];

export function getReportTabItems({ hasFinance, hasSales, hasInventory }) {
  return REPORT_TAB_ITEMS_BASE.filter((t) => {
    if (t.id === 'financeiro') return hasFinance;
    if (t.id === 'loja') return hasSales;
    if (t.id === 'estoque') return hasInventory;
    return true;
  });
}

export function getDefaultReportTab({ hasFinance, hasSales, hasInventory }) {
  return getReportTabItems({ hasFinance, hasSales, hasInventory })[0]?.id ?? 'funil';
}

/** Aliases legados de ?tab= → slug canônico (null = inválido / redirecionar ao default). */
export function normalizeReportTabParam(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t || t === 'visao-geral' || t === 'operador') return null;
  if (t === 'movimentacoes') return 'estoque';
  if (t === 'vendas') return 'loja';
  return REPORT_TABS.has(t) ? t : null;
}

export function getReportsTabFlags(activeTab) {
  const isLeadReportTab = activeTab === 'funil';
  const needsFunnelReport = isLeadReportTab;
  const needsStudentMetrics = activeTab === 'alunos';
  const isPeriodTab =
    needsFunnelReport ||
    needsStudentMetrics ||
    activeTab === 'financeiro' ||
    activeTab === 'loja' ||
    activeTab === 'estoque' ||
    activeTab === 'atividade';
  return { isLeadReportTab, needsFunnelReport, needsStudentMetrics, isPeriodTab };
}
