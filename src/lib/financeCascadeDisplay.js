/**
 * Linhas de exibição da cascata gerencial (ordem e rótulos).
 */

import { CASH_FLOW_CLASS } from './financeCashFlowMapping.js';

export const CASCADE_DISPLAY_ROWS = [
  {
    key: CASH_FLOW_CLASS.RECEITA_SERVICO,
    label: 'Receita com serviços (mensalidades)',
    kind: 'detail',
  },
  {
    key: CASH_FLOW_CLASS.RECEITA_PRODUTO,
    label: 'Receita com produtos (vendas)',
    kind: 'detail',
  },
  {
    key: 'desp_variavel',
    label: '(−) Despesas variáveis',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.DESP_VARIAVEL,
  },
  {
    key: 'desp_fixa',
    label: '(−) Despesas fixas',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.DESP_FIXA,
  },
  {
    key: 'resultado_operacional',
    label: '(=) Resultado operacional',
    kind: 'total',
  },
  {
    key: 'investimento',
    label: '(−) Investimentos',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.INVESTIMENTO,
  },
  {
    key: 'pgto_emprestimo',
    label: '(−) Pagamento de empréstimos',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.PGTO_EMPRESTIMO,
  },
  {
    key: 'pgto_fornecedor',
    label: '(−) Pagamento de fornecedores',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.PGTO_FORNECEDOR,
  },
  {
    key: 'resultado_patrimonial',
    label: '(=) Resultado patrimonial',
    kind: 'total',
  },
  {
    key: 'tomada_emprestimo',
    label: '(+) Tomada de empréstimos',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.TOMADA_EMPRESTIMO,
  },
  {
    key: 'injecao_socio',
    label: '(+) Injeção de sócios',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.INJECAO_SOCIO,
  },
  {
    key: 'retirada_socio',
    label: '(−) Retirada de sócios (pró-labore)',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.RETIRADA_SOCIO,
  },
  {
    key: 'resultado_final',
    label: '(=) Resultado final',
    kind: 'total',
  },
  {
    key: 'receita_terceiro',
    label: '(+) Receita de terceiros',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.RECEITA_TERCEIRO,
  },
  {
    key: 'despesa_terceiro',
    label: '(−) Despesas de terceiros',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.DESPESA_TERCEIRO,
  },
  {
    key: 'variacao_classificada',
    label: '(=) Variação de saldo (classificada)',
    kind: 'total',
  },
  {
    key: 'nao_classificado',
    label: 'Não classificado',
    kind: 'detail',
    lineKey: CASH_FLOW_CLASS.NAO_CLASSIFICADO,
    warn: true,
  },
  {
    key: 'variacao_saldo',
    label: 'Variação de saldo (contas)',
    kind: 'recon',
  },
];

export function cascadeRowLineKey(row) {
  return row.lineKey || row.key;
}

export function cascadeRowAmount(statement, row) {
  const data = statement?.cascadeData || {};
  if (row.kind === 'recon') {
    return data.variacao_saldo ?? statement?.bankReconciliation?.variacaoSaldo ?? null;
  }
  return data[row.key] ?? 0;
}

export function cascadeRowCategories(statement, row) {
  const lineKey = cascadeRowLineKey(row);
  return statement?.lines?.[lineKey]?.categories || [];
}
