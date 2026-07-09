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
    formula: 'data de ingresso (enrollmentDate) no intervalo; sem ingresso, converted_at',
    source: 'Coleções leads + students · enrollmentDate, converted_at',
    tooltip:
      'Matrículas com data de ingresso no período. Cadastros retroativos usam a data de ingresso informada, não a conversão no sistema.',
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
    label: 'Receita liquidada (Caixa)',
    formula: 'Soma de net/gross de entradas operacionais settled no período',
    source: 'Coleção FINANCIAL_TX · settledAt ou $createdAt no intervalo',
    tooltip: 'Entradas operacionais liquidadas no Caixa. Exclui aporte, empréstimo, transferências e receitas financeiras.',
  },
  financeExpenses: {
    id: 'financeExpenses',
    label: 'Despesas (Caixa)',
    formula: 'Soma de saídas operacionais settled no período',
    source: 'Coleção FINANCIAL_TX',
    tooltip: 'Despesas operacionais liquidadas no período. Exclui pagamento de empréstimo, transferências e tarifas financeiras.',
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
    label: 'Faturamento (loja)',
    formula: 'Soma total de vendas com status concluída no período',
    source: 'Coleção vendas · data da venda',
    tooltip: 'Apenas vendas do módulo Loja — não inclui mensalidades nem outras entradas do Caixa.',
  },
  activeStudentsEnd: {
    id: 'activeStudentsEnd',
    label: 'Alunos ativos (fim do período)',
    formula:
      'contact_type = student, matriculado antes do fim do período, e (sem exit_date ou exit_date > fim)',
    source: 'Coleções leads + students · converted_at, exit_date',
    tooltip: 'Tamanho da base matriculada na última data do intervalo selecionado.',
  },
  studentTicketMedio: {
    id: 'studentTicketMedio',
    label: 'Ticket médio',
    formula: 'total recebido em mensalidades ÷ quantidade de recebimentos no período',
    source: 'Coleção student_payments · paid_at (mensalidades e pacotes, exceto filhos de pacote)',
    tooltip:
      'Valor médio por recebimento de mensalidade no período. Não inclui vendas da Loja nem outras entradas do Caixa.',
  },
  inventoryStalled: {
    id: 'inventoryStalled',
    label: 'Produtos parados',
    formula: 'Contagem de produtos com zero unidades vendidas no período',
    source: 'Relatório de estoque · curva ABC',
    tooltip: 'Itens sem giro no intervalo — candidatos a promoção ou descontinuação.',
  },
};

/** IDs de KPI na UI que mapeiam para outra definição canônica. */
export const REPORT_KPI_TOOLTIP_ALIASES = {
  converted: 'newStudents',
  showed: 'completed',
  activeAtEnd: 'activeStudentsEnd',
  stalled: 'inventoryStalled',
};

export function getMetricDefinition(id) {
  return REPORT_METRIC_DEFINITIONS[id] || null;
}

export function metricTooltip(id) {
  const d = getMetricDefinition(id);
  if (!d) return '';
  return `${d.label}: ${d.formula}. Fonte: ${d.source}`;
}
