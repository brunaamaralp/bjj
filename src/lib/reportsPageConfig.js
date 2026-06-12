export const REPORT_TABS = new Set([
  'visao-geral',
  'funil',
  'alunos',
  'financeiro',
  'loja',
  'estoque',
  'movimentacoes',
  'operador',
]);

export const REPORT_TAB_ITEMS_BASE = [
  { id: 'visao-geral', label: 'Visão geral' },
  { id: 'funil', label: 'Funil' },
  { id: 'alunos', label: 'Alunos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'loja', label: 'Vendas' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'movimentacoes', label: 'Movimentações' },
  { id: 'operador', label: 'Por operador' },
];

export function getReportTabItems({ hasFinance, hasSales, hasInventory }) {
  return REPORT_TAB_ITEMS_BASE.filter((t) => {
    if (t.id === 'financeiro') return hasFinance;
    if (t.id === 'loja') return hasSales;
    if (t.id === 'estoque' || t.id === 'movimentacoes') return hasInventory;
    if (t.id === 'operador') return hasSales;
    return true;
  });
}

export function getReportsTabFlags(activeTab) {
  const isLeadReportTab = activeTab === 'visao-geral' || activeTab === 'funil';
  const needsFunnelReport = isLeadReportTab;
  const needsStudentMetrics = activeTab === 'alunos';
  const isPeriodTab =
    needsFunnelReport ||
    needsStudentMetrics ||
    activeTab === 'financeiro' ||
    activeTab === 'loja' ||
    activeTab === 'estoque' ||
    activeTab === 'movimentacoes' ||
    activeTab === 'operador';
  return { isLeadReportTab, needsFunnelReport, needsStudentMetrics, isPeriodTab };
}
