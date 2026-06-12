export const REPORT_TABS = new Set([
  'funil',
  'alunos',
  'financeiro',
  'loja',
  'estoque',
]);

export const REPORT_TAB_ITEMS_BASE = [
  { id: 'funil', label: 'Funil' },
  { id: 'alunos', label: 'Alunos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'loja', label: 'Vendas' },
  { id: 'estoque', label: 'Estoque' },
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

export function getReportsTabFlags(activeTab) {
  const isLeadReportTab = activeTab === 'funil';
  const needsFunnelReport = isLeadReportTab;
  const needsStudentMetrics = activeTab === 'alunos';
  const isPeriodTab =
    needsFunnelReport ||
    needsStudentMetrics ||
    activeTab === 'financeiro' ||
    activeTab === 'loja' ||
    activeTab === 'estoque';
  return { isLeadReportTab, needsFunnelReport, needsStudentMetrics, isPeriodTab };
}
