/** Textos de glossário financeiro (tooltips do hub /financeiro). */
export const FINANCE_TERM_HINTS = {
  regimeCaixa: 'Considera pagamentos na data em que foram recebidos.',
  regimeCompetence:
    'Considera pagamentos na data de vencimento, independente de quando foram recebidos.',
  projetado:
    'Valor esperado com base em mensalidades e lançamentos recorrentes ainda não recebidos.',
  realizado: 'Valor efetivamente recebido ou pago até hoje.',
  saldoAtualBancario:
    'Saldo consolidado das contas bancárias cadastradas (mesma base da Visão Geral).',
  saldoAtualLedger:
    'Saldo do caixa contábil (lançamentos liquidados). Cadastre contas bancárias em Minha Academia para alinhar com o extrato.',
  inadimplentes: 'Alunos com mensalidade em aberto após o vencimento.',
  aReceber:
    'Soma de mensalidades em aberto no mês, lançamentos de entrada pendentes no Caixa e vendas marcadas como a receber.',
  mensalidadePendenteCaixa:
    'Mensalidades pendentes ficam na grade de Mensalidades. Ao registrar o pagamento, a entrada é criada automaticamente no Caixa — não há lançamento pendente duplicado.',
  lancamentoPendente:
    'Lançamento manual criado sem marcar “Receber agora”. Liquide em Lançamentos para entrar no saldo do Caixa.',
  cobrancaFila:
    'Mensalidades vencidas acumuladas nos últimos 12 meses. Independente do mês de referência em Mensalidades.',
  aPagar:
    'Despesas programadas e pendentes: contas fixas (água, luz, telefone), aluguel e outras saídas com vencimento.',
  diasAtraso: 'Dias após o vencimento (D+). Ex.: D+10 = dez dias de atraso.',
};

/** Evento após marcar mês como conferido (MonthlyClosingTab → FinanceMonthPicker). */
export const CASH_CLOSING_UPDATED_EVENT = 'navi-cash-closing-updated';
