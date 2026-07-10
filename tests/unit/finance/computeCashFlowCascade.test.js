import { describe, expect, it } from 'vitest';
import { computeCashFlowCascade } from '../../../src/lib/computeCashFlowCascade.js';
import { computeDfc } from '../../../src/lib/computeDfc.js';
import { computeDre } from '../../../src/lib/computeDre.js';
import { FINANCE_CATEGORIES } from '../../../src/lib/financeCategories.js';
import { CASH_FLOW_CLASS } from '../../../src/lib/financeCashFlowMapping.js';
import { computeBankBalancesPayloadFromSettledDocs } from '../../../lib/server/financeBankBalancesData.js';

const PERIOD = { from: '2026-03-01', to: '2026-03-31' };
const ACCOUNTS_CFG = [{ bankName: 'Sicoob', account: '1', openingBalance: 0, openingBalanceDate: '' }];

function settledDoc(tx) {
  return { status: 'settled', academyId: 'ac-1', ...tx };
}

describe('computeCashFlowCascade', () => {
  it('mensalidade e produto entram em linhas distintas', () => {
    const txs = [
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
        type: 'product',
        category: FINANCE_CATEGORIES.VENDA_PRODUTO.label,
        settledAt: '2026-03-06T12:00:00.000Z',
        gross: 100,
        net: 100,
        direction: 'in',
      },
    ];

    const cascade = computeCashFlowCascade(PERIOD, txs);
    expect(cascade.cascadeData.receita_servico).toBe(300);
    expect(cascade.cascadeData.receita_produto).toBe(100);
    expect(cascade.cascadeData.resultado_operacional).toBe(400);
  });

  it('pró-labore vai para retirada_socio, não despesa fixa', () => {
    const cascade = computeCashFlowCascade(PERIOD, [
      {
        status: 'settled',
        type: 'equity_withdrawal',
        category: FINANCE_CATEGORIES.PRO_LABORE.label,
        settledAt: '2026-03-10T12:00:00.000Z',
        gross: 500,
        net: 500,
        direction: 'out',
      },
    ]);

    expect(cascade.lines[CASH_FLOW_CLASS.RETIRADA_SOCIO].net).toBe(-500);
    expect(cascade.cascadeData.desp_fixa).toBe(0);
    expect(cascade.cascadeData.resultado_final).toBe(-500);
  });

  it('split pooled por proporção de caixa (serviço vs produto)', () => {
    const txs = [
      {
        status: 'settled',
        type: 'plan',
        category: FINANCE_CATEGORIES.MENSALIDADE.label,
        settledAt: '2026-03-01T12:00:00.000Z',
        gross: 600,
        net: 600,
        direction: 'in',
      },
      {
        status: 'settled',
        type: 'product',
        category: FINANCE_CATEGORIES.VENDA_PRODUTO.label,
        settledAt: '2026-03-02T12:00:00.000Z',
        gross: 400,
        net: 400,
        direction: 'in',
      },
      {
        status: 'settled',
        type: 'other',
        category: FINANCE_CATEGORIES.OUTROS_RECEITA.label,
        settledAt: '2026-03-03T12:00:00.000Z',
        gross: 100,
        net: 100,
        direction: 'in',
      },
    ];

    const cascade = computeCashFlowCascade(PERIOD, txs);
    expect(cascade.meta.pooledSplitCount).toBe(1);
    expect(cascade.cascadeData.receita_servico).toBe(660);
    expect(cascade.cascadeData.receita_produto).toBe(440);
  });

  it('não classificado aparece em destaque sem forçar reconciliação', () => {
    const rawDocs = [
      settledDoc({
        type: 'expense_operational',
        category: 'Despesa misteriosa XYZ',
        gross: 50,
        net: 50,
        settledAt: '2026-03-10T12:00:00.000Z',
        bank_account: 'Sicoob · 1',
        direction: 'out',
      }),
    ];
    const bankPayload = computeBankBalancesPayloadFromSettledDocs(
      rawDocs,
      '2026-03-31',
      { bankAccounts: ACCOUNTS_CFG },
      { periodFrom: '2026-03-01', periodTo: '2026-03-31' }
    );
    const txs = rawDocs.map((d) => ({
      status: d.status,
      type: d.type,
      category: d.category,
      gross: d.gross,
      net: d.net,
      settledAt: d.settledAt,
      bank_account: d.bank_account,
      direction: d.direction,
    }));

    const cascade = computeCashFlowCascade(PERIOD, txs, null, bankPayload);
    expect(cascade.cascadeData.nao_classificado).toBe(-50);
    expect(cascade.bankReconciliation.variacaoSaldo).toBe(-50);
    expect(cascade.cascadeData.variacao_classificada).toBe(-50);
    expect(cascade.bankReconciliation.matches).toBe(true);
  });

  it('DRE e DFC permanecem inalteradas (regressão)', () => {
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
    const dfc = computeDfc(PERIOD, [tx]);

    expect(dre.groups['Receita Bruta'].total).toBe(100);
    expect(dre.groups['Resultado Financeiro'].total).toBe(3);
    expect(dfc.groups.Operacional.net).toBe(97);
  });
});
