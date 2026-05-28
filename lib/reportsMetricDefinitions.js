/**
 * Definições únicas de métricas dos Relatórios (UI + testes + servidor).
 * @typedef {{ id: string, label: string, formula: string, source: string, tooltip?: string }} ReportMetricDef
 */

/** @type {Record<string, ReportMetricDef>} */
export const REPORT_METRIC_DEFINITIONS = {
  newLeads: {
    id: 'newLeads',
    label: 'Novos leads',
    formula: 'Contagem de leads (origem ≠ Planilha) com $createdAt no intervalo',
    source: 'Coleção leads · $createdAt',
    tooltip: 'Primeiro registro do contato na base, no período selecionado.',
  },
  scheduled: {
    id: 'scheduled',
    label: 'Agendados',
    formula: 'Leads com scheduledDate (YYYY-MM-DD) dentro do intervalo',
    source: 'Coleção leads · scheduledDate',
    tooltip: 'Aulas experimentais agendadas para datas no período.',
  },
  completed: {
    id: 'completed',
    label: 'Compareceram',
    formula: 'Leads com attended_at no intervalo',
    source: 'Coleção leads · attended_at',
    tooltip: 'Quem compareceu à aula experimental (data de presença no período).',
  },
  missed: {
    id: 'missed',
    label: 'Não compareceram',
    formula: 'missed_at no período OU (status MISSED + scheduledDate no período)',
    source: 'Coleção leads · missed_at / status / scheduledDate',
    tooltip: 'Falta registrada explicitamente ou status de não comparecimento com data de aula no período.',
  },
  newStudents: {
    id: 'newStudents',
    label: 'Novos alunos',
    formula: 'converted_at dentro do intervalo (sem fallback por $updatedAt)',
    source: 'Coleções leads + students · converted_at',
    tooltip: 'Primeira matrícula registrada no período — usa somente a data converted_at.',
  },
  conversionRate: {
    id: 'conversionRate',
    label: 'Taxa de conversão',
    formula: 'round((novos alunos / novos leads) × 100)',
    source: 'Derivado · newStudents e newLeads',
    tooltip: 'Percentual de novos leads que viraram alunos no mesmo período.',
  },
  activeStudentsStart: {
    id: 'activeStudentsStart',
    label: 'Alunos ativos no início',
    formula:
      'contact_type = student, converted_at < início do período, e (sem exit_date ou exit_date ≥ início)',
    source: 'Coleções leads + students · converted_at, exit_date, student_status',
    tooltip:
      'Alunos já matriculados antes do primeiro dia do período e ainda não desligados na data inicial.',
  },
  deactivations: {
    id: 'deactivations',
    label: 'Desligamentos',
    formula: 'exit_date dentro do intervalo (aluno desligado)',
    source: 'Coleção leads · exit_date',
    tooltip: 'Matrículas encerradas no período (data de saída informada no desligamento).',
  },
  churnRate: {
    id: 'churnRate',
    label: 'Churn',
    formula: 'desligamentos / alunos ativos no início × 100 (%)',
    source: 'Derivado · deactivations e activeStudentsStart',
    tooltip: 'Percentual de alunos ativos no início que foram desligados no período.',
  },
  retentionRate: {
    id: 'retentionRate',
    label: 'Retenção',
    formula: '100% − churn (%)',
    source: 'Derivado · churnRate',
    tooltip: 'Complemento do churn: parcela da base inicial que permaneceu ativa no período.',
  },
  financeReceived: {
    id: 'financeReceived',
    label: 'Recebido (Caixa)',
    formula: 'Soma de net (ou gross) de FINANCIAL_TX type ≠ expense, status = settled',
    source: 'Coleção FINANCIAL_TX · settledAt ou $createdAt no intervalo',
    tooltip: 'Entradas liquidadas no Caixa no período.',
  },
  financeExpenses: {
    id: 'financeExpenses',
    label: 'Despesas (Caixa)',
    formula: 'Soma de valores de saída (expense / direction out) settled no período',
    source: 'Coleção FINANCIAL_TX',
    tooltip: 'Saídas liquidadas no período.',
  },
  financeBalance: {
    id: 'financeBalance',
    label: 'Saldo operacional',
    formula: 'Recebido − Despesas',
    source: 'Derivado · financeReceived e financeExpenses',
    tooltip: 'Mesma lógica do resumo operacional em Relatórios › Financeiro.',
  },
  storeRevenue: {
    id: 'storeRevenue',
    label: 'Faturamento (Loja)',
    formula: 'Soma total de vendas status = concluida no período',
    source: 'Coleção vendas · data da venda',
    tooltip: 'Vendas concluídas no intervalo de datas.',
  },
};

export function getMetricDefinition(id) {
  return REPORT_METRIC_DEFINITIONS[id] || null;
}

export function metricTooltip(id) {
  const d = getMetricDefinition(id);
  if (!d) return '';
  return `${d.label}: ${d.formula}. Fonte: ${d.source}`;
}
