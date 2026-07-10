import { describe, expect, it } from 'vitest';
import { computeCashFlowCascade } from '../../../src/lib/computeCashFlowCascade.js';
import { computeDre } from '../../../src/lib/computeDre.js';
import { computeDfc } from '../../../src/lib/computeDfc.js';
import { FINANCE_CATEGORIES } from '../../../src/lib/financeCategories.js';
import {
  CASH_FLOW_CLASS,
  cashFlowClassForTx,
} from '../../../src/lib/financeCashFlowMapping.js';
import { dreGroupForCategory } from '../../../src/lib/financeCategories.js';

const PERIOD = { from: '2026-04-01', to: '2026-04-30' };

const OUT_TYPES = new Set([
  'expense_operational',
  'expense_financial',
  'stock_purchase',
  'service_cogs',
  'consumable_cogs',
  'card_fee',
  'loan_repayment',
  'equity_withdrawal',
  'third_party_loan_out',
]);

function settledTx(categoryKey, overrides = {}) {
  const cat = FINANCE_CATEGORIES[categoryKey];
  const type = overrides.type || cat.type;
  const direction = overrides.direction || (OUT_TYPES.has(type) ? 'out' : 'in');

  return {
    status: 'settled',
    type,
    category: cat.label,
    settledAt: '2026-04-10T12:00:00.000Z',
    gross: 100,
    net: 100,
    direction,
    ...overrides,
  };
}

/** Categorias com cashFlowClass explícito (exceto split pooled e neutras). */
const EXPLICIT_CASCADE_EXPECTATIONS = {
  MENSALIDADE: CASH_FLOW_CLASS.RECEITA_SERVICO,
  VENDA_PRODUTO: CASH_FLOW_CLASS.RECEITA_PRODUTO,
  MATRICULA: CASH_FLOW_CLASS.RECEITA_SERVICO,
  RECEITA_FINANCEIRA: CASH_FLOW_CLASS.DESP_VARIAVEL,
  APORTE_CAPITAL: CASH_FLOW_CLASS.INJECAO_SOCIO,
  EMPRESTIMO_RECEBIDO: CASH_FLOW_CLASS.TOMADA_EMPRESTIMO,
  CANCELAMENTO: CASH_FLOW_CLASS.DESP_VARIAVEL,
  DESCONTO: CASH_FLOW_CLASS.DESP_VARIAVEL,
  CUSTO_ESTOQUE: CASH_FLOW_CLASS.PGTO_FORNECEDOR,
  CUSTO_SERVICO: CASH_FLOW_CLASS.PGTO_FORNECEDOR,
  INSUMO_ATENDIMENTO: CASH_FLOW_CLASS.DESP_VARIAVEL,
  ALUGUEL_ESPACO: CASH_FLOW_CLASS.DESP_FIXA,
  SALARIOS: CASH_FLOW_CLASS.DESP_FIXA,
  MARKETING: CASH_FLOW_CLASS.DESP_FIXA,
  IMPOSTOS_TAXAS: CASH_FLOW_CLASS.DESP_VARIAVEL,
  OUTRAS_DESPESAS: CASH_FLOW_CLASS.DESP_FIXA,
  EMPRESTIMO_PAGO: CASH_FLOW_CLASS.PGTO_EMPRESTIMO,
  TARIFAS_BANCARIAS: CASH_FLOW_CLASS.DESP_VARIAVEL,
  JUROS: CASH_FLOW_CLASS.DESP_VARIAVEL,
  TAXA_CARTAO: CASH_FLOW_CLASS.DESP_VARIAVEL,
  PRO_LABORE: CASH_FLOW_CLASS.RETIRADA_SOCIO,
  ROYALTY_FRANQUIA: CASH_FLOW_CLASS.DESP_FIXA,
  FRANQUIA_PATRIMONIO: CASH_FLOW_CLASS.INVESTIMENTO,
  REEMBOLSO_FUNCIONARIO: CASH_FLOW_CLASS.DESP_FIXA,
  REEMBOLSO_COMPRAS: CASH_FLOW_CLASS.DESP_FIXA,
  RECEITA_TERCEIROS: CASH_FLOW_CLASS.RECEITA_TERCEIRO,
  DESPESA_TERCEIROS: CASH_FLOW_CLASS.DESPESA_TERCEIRO,
  EMPRESTIMO_TERCEIRO_RECEBIDO: CASH_FLOW_CLASS.RECEITA_TERCEIRO,
  EMPRESTIMO_TERCEIRO_PAGO: CASH_FLOW_CLASS.DESPESA_TERCEIRO,
  ANTECIPACAO_CARTAO: CASH_FLOW_CLASS.DESP_VARIAVEL,
  PAGAMENTO_FORNECEDOR: CASH_FLOW_CLASS.PGTO_FORNECEDOR,
};

describe('financeCashFlowTaxonomy', () => {
  it('todas as categorias operacionais têm cashFlowClass explícito ou cascadeSplitRevenue', () => {
    for (const [key, cat] of Object.entries(FINANCE_CATEGORIES)) {
      if (cat.operationalBucket === 'neutral') continue;
      const hasClass = Boolean(cat.cashFlowClass);
      const hasSplit = Boolean(cat.cascadeSplitRevenue);
      expect(hasClass || hasSplit, `${key} sem classificação de cascata`).toBe(true);
    }
  });

  it.each(Object.entries(EXPLICIT_CASCADE_EXPECTATIONS))(
    '%s → linha %s da cascata',
    (key, expectedClass) => {
      const tx = settledTx(key);
      expect(cashFlowClassForTx(tx)).toBe(expectedClass);
    }
  );

  it('pró-labore não entra em despesa operacional (desp_fixa)', () => {
    const cascade = computeCashFlowCascade(PERIOD, [settledTx('PRO_LABORE')]);
    expect(cascade.cascadeData.retirada_socio).toBe(-100);
    expect(cascade.cascadeData.desp_fixa).toBe(0);
    expect(cascade.cascadeData.resultado_operacional).toBe(0);
  });

  it('terceiros ficam fora do resultado operacional', () => {
    const cascade = computeCashFlowCascade(PERIOD, [
      settledTx('RECEITA_TERCEIROS', { direction: 'in' }),
      settledTx('DESPESA_TERCEIROS'),
      settledTx('EMPRESTIMO_TERCEIRO_RECEBIDO', { direction: 'in' }),
      settledTx('EMPRESTIMO_TERCEIRO_PAGO'),
    ]);
    expect(cascade.cascadeData.resultado_operacional).toBe(0);
    expect(cascade.cascadeData.receita_terceiro).toBe(200);
    expect(cascade.cascadeData.despesa_terceiro).toBe(-200);
  });

  it('empréstimo da empresa não usa linha de terceiros', () => {
    const cascade = computeCashFlowCascade(PERIOD, [
      settledTx('EMPRESTIMO_RECEBIDO', { direction: 'in' }),
      settledTx('EMPRESTIMO_PAGO'),
    ]);
    expect(cascade.cascadeData.tomada_emprestimo).toBe(100);
    expect(cascade.cascadeData.pgto_emprestimo).toBe(-100);
    expect(cascade.cascadeData.receita_terceiro).toBe(0);
    expect(cascade.cascadeData.despesa_terceiro).toBe(0);
  });

  it('insumo: CMV na DRE e desp_variavel na cascata (mesmo lançamento)', () => {
    const tx = {
      ...settledTx('INSUMO_ATENDIMENTO'),
      competence_month: '2026-04',
    };
    expect(dreGroupForCategory(tx.category)).toBe('CMV/CPV');
    expect(cashFlowClassForTx(tx)).toBe(CASH_FLOW_CLASS.DESP_VARIAVEL);

    const dre = computeDre({ month: '2026-04' }, [tx]);
    const cascade = computeCashFlowCascade(PERIOD, [tx]);

    expect(dre.groups['CMV/CPV'].total).toBe(100);
    expect(cascade.cascadeData.desp_variavel).toBe(-100);
    expect(cascade.cascadeData.pgto_fornecedor).toBe(0);
  });

  it('salários permanecem em desp_fixa, separados de pró-labore', () => {
    const cascade = computeCashFlowCascade(PERIOD, [
      settledTx('SALARIOS'),
      settledTx('PRO_LABORE'),
    ]);
    expect(cascade.cascadeData.desp_fixa).toBe(-100);
    expect(cascade.cascadeData.retirada_socio).toBe(-100);
  });

  it('reembolso de compras é desp_fixa, não salário', () => {
    expect(cashFlowClassForTx(settledTx('REEMBOLSO_COMPRAS'))).toBe(CASH_FLOW_CLASS.DESP_FIXA);
    expect(cashFlowClassForTx(settledTx('REEMBOLSO_COMPRAS'))).not.toBe(CASH_FLOW_CLASS.RETIRADA_SOCIO);
  });

  it('franquia royalty vs patrimonial em linhas distintas', () => {
    const cascade = computeCashFlowCascade(PERIOD, [
      settledTx('ROYALTY_FRANQUIA'),
      settledTx('FRANQUIA_PATRIMONIO'),
    ]);
    expect(cascade.cascadeData.desp_fixa).toBe(-100);
    expect(cascade.cascadeData.investimento).toBe(-100);
  });

  it('DRE e DFC inalteradas para mensalidade típica', () => {
    const tx = {
      status: 'settled',
      type: 'plan',
      category: FINANCE_CATEGORIES.MENSALIDADE.label,
      competence_month: '2026-04',
      settledAt: '2026-04-10T12:00:00.000Z',
      gross: 100,
      fee: 3,
      net: 97,
      direction: 'in',
      bank_account: 'Sicoob · 1',
    };

    const dre = computeDre({ month: '2026-04' }, [tx]);
    const dfc = computeDfc(PERIOD, [tx]);

    expect(dre.groups['Receita Bruta'].total).toBe(100);
    expect(dre.groups['Resultado Financeiro'].total).toBe(3);
    expect(dfc.groups.Operacional.net).toBe(97);
  });
});
