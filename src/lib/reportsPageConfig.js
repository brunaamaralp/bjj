export const REPORT_TABS = new Set([
  'funil',
  'alunos',
  'frequencia',
  'aulas-staff',
  'financeiro',
  'loja',
  'estoque',
  'atividade',
]);

export const REPORT_TAB_ITEMS_BASE = [
  { id: 'funil', label: 'Funil' },
  { id: 'alunos', label: 'Alunos' },
  { id: 'frequencia', label: 'Frequência' },
  { id: 'aulas-staff', label: 'Aulas (staff)' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'loja', label: 'Vendas' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'atividade', label: 'Atividade' },
];

export function getReportTabItems({ hasFinance, hasSales, hasInventory, hasAttendance }) {
  return REPORT_TAB_ITEMS_BASE.filter((t) => {
    if (t.id === 'financeiro') return hasFinance;
    if (t.id === 'loja') return hasSales;
    if (t.id === 'estoque') return hasInventory;
    if (t.id === 'frequencia') return hasAttendance;
    return true;
  });
}

export function getDefaultReportTab({ hasFinance, hasSales, hasInventory, hasAttendance }) {
  return getReportTabItems({ hasFinance, hasSales, hasInventory, hasAttendance })[0]?.id ?? 'funil';
}

/** Aliases legados de ?tab= → slug canônico (null = inválido / redirecionar ao default). */
export function normalizeReportTabParam(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t || t === 'visao-geral' || t === 'operador') return null;
  if (t === 'movimentacoes') return 'estoque';
  if (t === 'vendas') return 'loja';
  if (t === 'aulas' || t === 'staff') return 'aulas-staff';
  return REPORT_TABS.has(t) ? t : null;
}

export function getReportsTabFlags(activeTab) {
  const isLeadReportTab = activeTab === 'funil';
  const needsFunnelReport = isLeadReportTab;
  const needsStudentMetrics = activeTab === 'alunos';
  const needsFrequencyReport = activeTab === 'frequencia';
  const needsAulasStaffReport = activeTab === 'aulas-staff';
  const isPeriodTab =
    needsFunnelReport ||
    needsStudentMetrics ||
    needsFrequencyReport ||
    needsAulasStaffReport ||
    activeTab === 'financeiro' ||
    activeTab === 'loja' ||
    activeTab === 'estoque' ||
    activeTab === 'atividade';
  return {
    isLeadReportTab,
    needsFunnelReport,
    needsStudentMetrics,
    needsFrequencyReport,
    needsAulasStaffReport,
    isPeriodTab,
  };
}
