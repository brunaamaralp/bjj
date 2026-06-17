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
  cardFeesRepasse:
    'Percentuais acrescidos ao valor da mensalidade cobrados do aluno (cartão ou PIX). Não são a taxa da maquininha no extrato bancário.',
  liquidoBancario:
    'Valor que entra na conta após a taxa da maquininha. Configure em Minha Academia → Taxas ou por conta em Recebimento.',
  previsaoBrutoCliente:
    'Total que você espera receber dos alunos e clientes no período, antes da taxa da maquininha. O saldo em conta pode ser menor.',
  previsaoLiquidoEstimado:
    'Entrada líquida estimada no banco após a taxa da maquininha (quando configurada).',
  previsaoSaldoAcumulado:
    'Saldo projetado semana a semana com entradas líquidas estimadas (após taxa da maquininha) menos saídas previstas.',
  previsaoMdrOpcional:
    'Opcional: configure as taxas da maquininha em Minha Academia → Taxas para estimar o líquido no banco. Sem taxas, bruto e líquido coincidem.',
  brutoCaixa:
    'Soma do valor bruto cobrado nos lançamentos espelhados do Caixa (mensalidades pagas com financial_tx_id).',
  taxaCaixaMaquininha:
    'Taxa da maquininha registrada no espelho do Caixa — não é o repasse ao aluno configurado nos planos.',
  /** @deprecated use taxaCaixaMaquininha */
  taxaCaixaMdr:
    'Taxa da maquininha registrada no espelho do Caixa — não é o repasse ao aluno configurado nos planos.',
  maquininhaPorConta:
    'Se cada conta recebe por uma maquininha com taxas diferentes, desligue o padrão e informe as taxas desta conta.',
};

/** Evento após marcar mês como conferido (MonthlyClosingTab → FinanceMonthPicker). */
export const CASH_CLOSING_UPDATED_EVENT = 'navi-cash-closing-updated';
