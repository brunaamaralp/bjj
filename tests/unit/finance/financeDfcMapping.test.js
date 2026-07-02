import { describe, expect, it } from 'vitest';
import {
  DFC_GROUPS,
  dfcGroupForOperationalBucket,
  dfcGroupForTx,
  isDfcExcludedTx,
} from '../../../src/lib/financeDfcMapping.js';
import { FINANCE_CATEGORIES } from '../../../src/lib/financeCategories.js';

describe('financeDfcMapping', () => {
  it('financial bucket legado mapeia para Operacional', () => {
    expect(dfcGroupForOperationalBucket('financial')).toBe(DFC_GROUPS.OPERATIONAL);
  });

  it('financing → Financiamento; neutral → null', () => {
    expect(dfcGroupForOperationalBucket('financing')).toBe(DFC_GROUPS.FINANCING);
    expect(dfcGroupForOperationalBucket('neutral')).toBeNull();
  });

  it('taxa de cartão e juros → Operacional na DFC', () => {
    expect(
      dfcGroupForTx({
        type: 'card_fee',
        category: FINANCE_CATEGORIES.TAXA_CARTAO.label,
        status: 'settled',
        gross: 5,
      })
    ).toBe(DFC_GROUPS.OPERATIONAL);

    expect(
      dfcGroupForTx({
        type: 'expense_financial',
        category: FINANCE_CATEGORIES.JUROS.label,
        status: 'settled',
        gross: 10,
        direction: 'out',
      })
    ).toBe(DFC_GROUPS.OPERATIONAL);
  });

  it('aporte de capital → Financiamento', () => {
    expect(
      dfcGroupForTx({
        type: 'equity_injection',
        category: FINANCE_CATEGORIES.APORTE_CAPITAL.label,
        status: 'settled',
        gross: 1000,
      })
    ).toBe(DFC_GROUPS.FINANCING);
  });

  it('sale_cmv e transferência neutral são excluídos', () => {
    expect(
      isDfcExcludedTx({
        origin_type: 'sale_cmv',
        type: 'stock_purchase',
        status: 'settled',
        gross: 50,
      })
    ).toBe(true);

    expect(
      isDfcExcludedTx({
        type: 'internal_transfer',
        category: FINANCE_CATEGORIES.TRANSFERENCIA_RECEBIDA.label,
        status: 'settled',
        gross: 100,
      })
    ).toBe(true);
  });
});
