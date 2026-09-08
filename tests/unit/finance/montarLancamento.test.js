import { describe, expect, it } from 'vitest';
import { montarLancamento } from '../../../src/components/finance/montarLancamento.js';
import { FINANCE_CATEGORIES } from '../../../src/lib/financeCategories.js';

function baseAccounts(extra = []) {
  return [
    { id: 'acc-caixa', code: '1.1.1', name: 'Caixa', type: 'ativo', nature: 'devedora' },
    { id: 'acc-411', code: '4.1.1', name: 'Receita de Vendas', type: 'receita', nature: 'credora' },
    { id: 'acc-412', code: '4.1.2', name: 'Aulas avulsas / day pass', type: 'receita', nature: 'credora' },
    { id: 'acc-621', code: '6.2.1', name: 'Despesas Gerais e Adm', type: 'despesa', nature: 'devedora' },
    { id: 'acc-623', code: '6.2.3', name: 'Limpeza e higiene', type: 'despesa', nature: 'devedora' },
    ...extra,
  ];
}

describe('montarLancamento — dreAccount por categoria', () => {
  it('despesa nova (Limpeza) debita 6.2.3, não 6.2.1', () => {
    const entry = montarLancamento(
      {
        id: 'tx-limp',
        status: 'settled',
        type: 'expense_operational',
        category: FINANCE_CATEGORIES.LIMPEZA.label,
        gross: 150,
        direction: 'out',
      },
      baseAccounts(),
      'acad-1'
    );
    expect(entry?.lines).toHaveLength(2);
    expect(entry.lines[0]).toMatchObject({ accountId: 'acc-623', debit: 150 });
    expect(entry.lines[1]).toMatchObject({ accountId: 'acc-caixa', credit: 150 });
  });

  it('Outras despesas continua em 6.2.1', () => {
    const entry = montarLancamento(
      {
        id: 'tx-outras',
        status: 'settled',
        type: 'expense_operational',
        category: FINANCE_CATEGORIES.OUTRAS_DESPESAS.label,
        gross: 80,
        direction: 'out',
      },
      baseAccounts(),
      'acad-1'
    );
    expect(entry?.lines[0]).toMatchObject({ accountId: 'acc-621', debit: 80 });
  });

  it('Aulas avulsas credita 4.1.2, não 4.1.1', () => {
    const entry = montarLancamento(
      {
        id: 'tx-aula',
        status: 'settled',
        type: 'other',
        category: FINANCE_CATEGORIES.AULAS_AVULSAS.label,
        gross: 100,
        direction: 'in',
      },
      baseAccounts(),
      'acad-1'
    );
    expect(entry?.lines[0]).toMatchObject({ accountId: 'acc-caixa', debit: 100 });
    expect(entry.lines[1]).toMatchObject({ accountId: 'acc-412', credit: 100 });
  });

  it('Mensalidades continua creditando 4.1.1', () => {
    const entry = montarLancamento(
      {
        id: 'tx-men',
        status: 'settled',
        type: 'plan',
        category: FINANCE_CATEGORIES.MENSALIDADE.label,
        gross: 200,
        direction: 'in',
      },
      baseAccounts(),
      'acad-1'
    );
    expect(entry?.lines[1]).toMatchObject({ accountId: 'acc-411', credit: 200 });
  });
});
