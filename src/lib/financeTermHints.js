/** Textos de glossário financeiro (tooltips do hub /financeiro). */
export const FINANCE_TERM_HINTS = {
  regimeCaixa: 'Considera pagamentos na data em que foram recebidos.',
  regimeCompetence:
    'Considera pagamentos na data de vencimento, independente de quando foram recebidos.',
  projetado:
    'Valor esperado com base em mensalidades e lançamentos recorrentes ainda não recebidos.',
  realizado: 'Valor efetivamente recebido ou pago até hoje.',
  saldoAtualBancario:
    'Saldo consolidado das contas bancárias cadastradas na data de referência do mês selecionado.',
  saldoPeriodoVisaoGeral:
    'Entradas menos saídas liquidadas no intervalo do mês selecionado (1º dia até hoje ou fim do mês).',
  saldoContaNaData:
    'Posição liquidada da conta na data final do intervalo visível — não é necessariamente o saldo de hoje se você consultar um mês passado.',
  entradasSaidasPeriodoConta:
    'Movimentação liquidada apenas dentro do intervalo do mês selecionado, não o histórico acumulado da conta.',
  aReceberIndependeMes:
    'Valores a receber refletem o snapshot global da academia — não são filtrados pelo mês do seletor.',
  previsaoIndependeMes:
    'Previsão de 30 dias olha para frente a partir de hoje — independe do mês selecionado na Visão Geral.',
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
    'Valor que entra na conta após a taxa da maquininha. Configure em Minha Academia → Financeiro → Taxas e recebedores.',
  previsaoBrutoCliente:
    'Total que você espera receber dos alunos e clientes no período, antes da taxa da maquininha. O saldo em conta pode ser menor.',
  previsaoLiquidoEstimado:
    'Entrada líquida estimada no banco após a taxa da maquininha (quando configurada).',
  previsaoSaldoAcumulado:
    'Saldo projetado semana a semana com entradas líquidas estimadas (após taxa da maquininha) menos saídas previstas.',
  previsaoMdrOpcional:
    'Opcional: cadastre recebedores (PagBank, Asaas…) e taxas por bandeira em Minha Academia → Financeiro → Taxas e recebedores. Sem taxas da maquininha, bruto e líquido coincidem na previsão.',
  brutoCaixa:
    'Soma do valor bruto cobrado nos lançamentos espelhados do Caixa (mensalidades pagas com financial_tx_id).',
  taxaCaixaMaquininha:
    'Taxa da maquininha registrada no espelho do Caixa — não é o repasse ao aluno configurado nos planos.',
  /** @deprecated use taxaCaixaMaquininha */
  taxaCaixaMdr:
    'Taxa da maquininha registrada no espelho do Caixa — não é o repasse ao aluno configurado nos planos.',
  maquininhaPorConta:
    'Vincule cada conta ou meio de captura ao recebedor correto em Taxas e recebedores — as taxas ficam centralizadas lá.',
};

/** Evento após marcar mês como conferido (MonthlyClosingTab → FinanceMonthPicker). */
export const CASH_CLOSING_UPDATED_EVENT = 'navi-cash-closing-updated';
