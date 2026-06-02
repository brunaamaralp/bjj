/** Textos de glossário financeiro (tooltips do hub /financeiro). */
export const FINANCE_TERM_HINTS = {
  regimeCaixa: 'Considera pagamentos na data em que foram recebidos.',
  regimeCompetence:
    'Considera pagamentos na data de vencimento, independente de quando foram recebidos.',
  projetado:
    'Valor esperado com base em mensalidades e lançamentos recorrentes ainda não recebidos.',
  realizado: 'Valor efetivamente recebido ou pago até hoje.',
  inadimplentes: 'Alunos com mensalidade em aberto após o vencimento.',
};

/** Evento após marcar mês como conferido (MonthlyClosingTab → FinanceMonthPicker). */
export const CASH_CLOSING_UPDATED_EVENT = 'navi-cash-closing-updated';
