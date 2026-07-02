import { describe, expect, it } from 'vitest';
import { computeDfc } from '../../../src/lib/computeDfc.js';
import { computeDre } from '../../../src/lib/computeDre.js';
import { FINANCE_CATEGORIES } from '../../../src/lib/financeCategories.js';
import { computeBankAccountBalances } from '../../../src/lib/bankAccountBalances.js';
import { computeBankBalancesPayloadFromSettledDocs } from '../../../lib/server/financeBankBalancesData.js';

const ACCOUNTS = [{ bankName: 'Sicoob', account: '1', openingBalance: 0, openingBalanceDate: '' }];
const PERIOD = { from: '2026-03-01', to: '2026-03-31' };

function settledDoc(tx) {
  return {
    status: 'settled',
    academyId: 'ac-1',
    ...tx,
  };
}

describe('computeDfc', () => {
  it('consistência DRE gross vs DFC net com fee implícito', () => {
    const tx = {
      status: 'settled',
      type: 'plan',
      category: FINANCE_CATEGORIES.MENSALIDADE.label,
      competence_month: '2026-03',
      settledAt: '2026-03-10T12:00:00.000Z',
      gross: 100,
      fee: 3,
      net: 97,
      direction: 'in',
      bank_account: 'Sicoob · 1',
    };

    const dre = computeDre({ month: '2026-03' }, [tx]);
    const dfc = computeDfc(PERIOD, [tx], null, null);

    expect(dre.groups['Receita Bruta'].total).toBe(100);
    expect(dre.groups['Resultado Financeiro'].total).toBe(3);
    expect(dfc.groups.Operacional.net).toBe(97);
    expect(dre.dreData['Receita Bruta'] - dre.groups['Resultado Financeiro'].total).toBe(
      dfc.groups.Operacional.net
    );
  });

  it('competência ≠ caixa — DFC usa settledAt', () => {
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
      bank_account: 'Sicoob · 1',
    };

    const dreJan = computeDre({ month: '2026-01' }, [tx]);
    const dfcMar = computeDfc(PERIOD, [tx]);

    expect(dreJan.groups['Receita Bruta'].total).toBe(200);
    expect(dfcMar.groups.Operacional.net).toBe(200);
    expect(computeDfc({ month: '2026-01' }, [tx]).groups.Operacional.net).toBe(0);
  });

  it('sale_cmv fora da DFC e CMV na DRE', () => {
    const cmv = {
      status: 'settled',
      type: 'stock_purchase',
      category: FINANCE_CATEGORIES.CUSTO_ESTOQUE.label,
      origin_type: 'sale_cmv',
      settledAt: '2026-03-05T12:00:00.000Z',
      gross: 30,
      net: 30,
      direction: 'out',
      bank_account: 'Sicoob · 1',
    };

    const dre = computeDre({ month: '2026-03' }, [cmv]);
    const dfc = computeDfc(PERIOD, [cmv]);

    expect(dre.groups['CMV/CPV'].total).toBe(30);
    expect(dfc.meta.excludedSaleCmv).toBe(1);
    expect(dfc.variacaoCaixa).toBe(0);
  });

  it('transferência neutral excluída', () => {
    const dfc = computeDfc(PERIOD, [
      {
        status: 'settled',
        type: 'internal_transfer',
        category: FINANCE_CATEGORIES.TRANSFERENCIA_RECEBIDA.label,
        settledAt: '2026-03-02T12:00:00.000Z',
        gross: 500,
        net: 500,
        direction: 'in',
      },
    ]);

    expect(dfc.meta.excludedNeutral).toBe(1);
    expect(dfc.variacaoCaixa).toBe(0);
  });

  it('aporte → Financiamento', () => {
    const dfc = computeDfc(PERIOD, [
      {
        status: 'settled',
        type: 'equity_injection',
        category: FINANCE_CATEGORIES.APORTE_CAPITAL.label,
        settledAt: '2026-03-01T12:00:00.000Z',
        gross: 1000,
        net: 1000,
        direction: 'in',
      },
    ]);

    expect(dfc.groups.Financiamento.net).toBe(1000);
  });

  it('Operacional detalha categorias (mensalidades, matrículas, despesas)', () => {
    const dfc = computeDfc(PERIOD, [
      {
        status: 'settled',
        type: 'plan',
        category: FINANCE_CATEGORIES.MENSALIDADE.label,
        settledAt: '2026-03-05T12:00:00.000Z',
        gross: 300,
        net: 300,
        direction: 'in',
      },
      {
        status: 'settled',
        type: 'enrollment',
        category: FINANCE_CATEGORIES.MATRICULA.label,
        settledAt: '2026-03-06T12:00:00.000Z',
        gross: 150,
        net: 150,
        direction: 'in',
      },
      {
        status: 'settled',
        type: 'expense_operational',
        category: FINANCE_CATEGORIES.MANUTENCAO.label,
        settledAt: '2026-03-10T12:00:00.000Z',
        gross: 80,
        net: 80,
        direction: 'out',
      },
    ]);

    const cats = dfc.groups.Operacional.categories.map((c) => c.label);
    expect(cats).toContain(FINANCE_CATEGORIES.MENSALIDADE.label);
    expect(cats).toContain(FINANCE_CATEGORIES.MATRICULA.label);
    expect(cats).toContain(FINANCE_CATEGORIES.MANUTENCAO.label);
    expect(dfc.groups.Operacional.net).toBe(370);
  });

  it('inferência por type quando category vazia', () => {
    const dfc = computeDfc(PERIOD, [
      {
        status: 'settled',
        type: 'plan',
        category: '',
        settledAt: '2026-03-05T12:00:00.000Z',
        gross: 200,
        net: 200,
        direction: 'in',
      },
    ]);

    expect(dfc.groups.Operacional.categories[0]?.label).toBe(FINANCE_CATEGORIES.MENSALIDADE.label);
  });

  it('invariante saldoInicial + fluxo = saldoFinal (cards)', () => {
    const rawDocs = [
      settledDoc({
        type: 'plan',
        gross: 100,
        net: 97,
        fee: 3,
        settledAt: '2026-03-10T12:00:00.000Z',
        bank_account: 'Sicoob · 1',
        direction: 'in',
      }),
      settledDoc({
        type: 'exp_operational',
        gross: 40,
        net: 40,
        settledAt: '2026-03-20T12:00:00.000Z',
        bank_account: 'Sicoob · 1',
        direction: 'out',
        category: FINANCE_CATEGORIES.MANUTENCAO.label,
      }),
    ];

    const financeConfig = { bankAccounts: ACCOUNTS };
    const bankPayload = computeBankBalancesPayloadFromSettledDocs(
      rawDocs,
      '2026-03-31',
      financeConfig,
      { periodFrom: '2026-03-01', periodTo: '2026-03-31' }
    );

    const txs = rawDocs.map((d) => ({
      status: d.status,
      type: d.type,
      category: d.category || FINANCE_CATEGORIES.MENSALIDADE.label,
      gross: d.gross,
      net: d.net,
      fee: d.fee,
      settledAt: d.settledAt,
      bank_account: d.bank_account,
      direction: d.direction,
    }));

    const dfc = computeDfc(PERIOD, txs, null, bankPayload);

    expect(dfc.bankReconciliation.saldoInicial).toBe(0);
    expect(dfc.bankReconciliation.saldoFinal).toBe(57);
    expect(dfc.bankReconciliation.fluxoLiquido).toBe(57);
    expect(dfc.bankReconciliation.matches).toBe(true);

    const direct = computeBankAccountBalances({
      accounts: ACCOUNTS,
      transactions: txs,
      asOfYmd: '2026-03-31',
      periodFrom: '2026-03-01',
      periodTo: '2026-03-31',
    });
    expect(dfc.bankReconciliation.saldoFinal).toBe(direct.totalBalance);
  });

  it('mês sem movimento — variacao zero', () => {
    const dfc = computeDfc(PERIOD, []);
    expect(dfc.variacaoCaixa).toBe(0);
    expect(dfc.meta.includedTxCount).toBe(0);
  });

  it('pendente não entra na DFC', () => {
    const dfc = computeDfc(PERIOD, [
      {
        status: 'pending',
        type: 'plan',
        category: FINANCE_CATEGORIES.MENSALIDADE.label,
        settledAt: '',
        gross: 90,
        net: 90,
        direction: 'in',
      },
    ]);
    expect(dfc.meta.includedTxCount).toBe(0);
  });
});
