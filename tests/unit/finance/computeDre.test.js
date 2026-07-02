import { describe, expect, it } from 'vitest';
import { computeDre, IMPLICIT_FEE_CATEGORY } from '../../../src/lib/computeDre.js';
import { FINANCE_CATEGORIES } from '../../../src/lib/financeCategories.js';

const PERIOD = { month: '2026-03' };

describe('computeDre', () => {
  it('receita GROSS e fee implícito na DRE (Opção A)', () => {
    const dre = computeDre(PERIOD, [
      {
        status: 'settled',
        type: 'plan',
        category: FINANCE_CATEGORIES.MENSALIDADE.label,
        competence_month: '2026-03',
        settledAt: '2026-03-10T12:00:00.000Z',
        gross: 100,
        fee: 3,
        net: 97,
        direction: 'in',
      },
    ]);

    expect(dre.groups['Receita Bruta'].total).toBe(100);
    expect(dre.groups['Resultado Financeiro'].total).toBe(3);
    expect(dre.groups['Resultado Financeiro'].categories[0].label).toBe(IMPLICIT_FEE_CATEGORY);
    expect(dre.dreData['Receita Líquida']).toBe(100);
    expect(dre.dreData['Resultado Líquido']).toBe(97);
  });

  it('competência e caixa em meses diferentes — DRE usa competence_month', () => {
    const tx = {
      status: 'settled',
      type: 'plan',
      category: FINANCE_CATEGORIES.MENSALIDADE.label,
      competence_month: '2026-01',
      settledAt: '2026-03-15T12:00:00.000Z',
      gross: 200,
      fee: 0,
      net: 200,
      direction: 'in',
    };

    const dreJan = computeDre({ month: '2026-01' }, [tx]);
    const dreMar = computeDre({ month: '2026-03' }, [tx]);

    expect(dreJan.groups['Receita Bruta'].total).toBe(200);
    expect(dreMar.groups['Receita Bruta'].total).toBe(0);
  });

  it('conta competência fallback e incrementa meta', () => {
    const dre = computeDre(PERIOD, [
      {
        status: 'settled',
        type: 'plan',
        category: FINANCE_CATEGORIES.MENSALIDADE.label,
        settledAt: '2026-03-05T12:00:00.000Z',
        gross: 50,
        fee: 0,
        net: 50,
        direction: 'in',
      },
    ]);

    expect(dre.meta.competenceFallbackCount).toBe(1);
    expect(dre.meta.includedTxCount).toBe(1);
    expect(dre.groups['Receita Bruta'].total).toBe(50);
  });

  it('estorno entra em Deduções', () => {
    const dre = computeDre(PERIOD, [
      {
        status: 'settled',
        type: 'refund',
        category: FINANCE_CATEGORIES.CANCELAMENTO.label,
        competence_month: '2026-03',
        settledAt: '2026-03-12T12:00:00.000Z',
        gross: 40,
        fee: 0,
        net: 40,
        direction: 'in',
      },
      {
        status: 'settled',
        type: 'plan',
        category: FINANCE_CATEGORIES.MENSALIDADE.label,
        competence_month: '2026-03',
        settledAt: '2026-03-01T12:00:00.000Z',
        gross: 140,
        fee: 0,
        net: 140,
        direction: 'in',
      },
    ]);

    expect(dre.groups['Deduções'].total).toBe(40);
    expect(dre.dreData['Receita Líquida']).toBe(100);
  });

  it('sale_cmv entra em CMV/CPV na DRE', () => {
    const dre = computeDre(PERIOD, [
      {
        status: 'settled',
        type: 'stock_purchase',
        category: FINANCE_CATEGORIES.CUSTO_ESTOQUE.label,
        origin_type: 'sale_cmv',
        competence_month: '2026-03',
        settledAt: '2026-03-08T12:00:00.000Z',
        gross: 35,
        fee: 0,
        net: 35,
        direction: 'out',
      },
      {
        status: 'settled',
        type: 'product',
        category: FINANCE_CATEGORIES.VENDA_PRODUTO.label,
        competence_month: '2026-03',
        settledAt: '2026-03-08T12:00:00.000Z',
        gross: 100,
        fee: 0,
        net: 100,
        direction: 'in',
      },
    ]);

    expect(dre.groups['CMV/CPV'].total).toBe(35);
    expect(dre.dreData['Lucro Bruto']).toBe(65);
  });

  it('categoria desconhecida → Não classificado', () => {
    const dre = computeDre(PERIOD, [
      {
        status: 'settled',
        type: 'expense_operational',
        category: 'Despesa misteriosa XYZ',
        competence_month: '2026-03',
        settledAt: '2026-03-02T12:00:00.000Z',
        gross: 25,
        fee: 0,
        net: 25,
        direction: 'out',
      },
    ]);

    expect(dre.groups['Não classificado'].total).toBe(25);
  });

  it('mês vazio retorna zeros', () => {
    const dre = computeDre(PERIOD, []);
    expect(dre.dreData['Receita Bruta']).toBe(0);
    expect(dre.dreData['Resultado Líquido']).toBe(0);
    expect(dre.meta.includedTxCount).toBe(0);
  });

  it('borda de período — competência fora do intervalo não entra', () => {
    const dre = computeDre({ from: '2026-03-01', to: '2026-03-31' }, [
      {
        status: 'settled',
        type: 'plan',
        category: FINANCE_CATEGORIES.MENSALIDADE.label,
        competence_month: '2026-02',
        settledAt: '2026-02-28T12:00:00.000Z',
        gross: 80,
        net: 80,
        direction: 'in',
      },
      {
        status: 'settled',
        type: 'plan',
        category: FINANCE_CATEGORIES.MENSALIDADE.label,
        competence_month: '2026-03',
        settledAt: '2026-03-31T23:59:00.000Z',
        gross: 120,
        net: 120,
        direction: 'in',
      },
    ]);

    expect(dre.groups['Receita Bruta'].total).toBe(120);
  });

  it('aportes de capital não entram na DRE', () => {
    const dre = computeDre(PERIOD, [
      {
        status: 'settled',
        type: 'equity_injection',
        category: FINANCE_CATEGORIES.APORTE_CAPITAL.label,
        competence_month: '2026-03',
        settledAt: '2026-03-01T12:00:00.000Z',
        gross: 5000,
        net: 5000,
        direction: 'in',
      },
    ]);

    expect(dre.meta.includedTxCount).toBe(0);
    expect(dre.dreData['Receita Bruta']).toBe(0);
  });
});
