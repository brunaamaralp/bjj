import { describe, expect, it } from 'vitest';
import {
  availableQuantityForLineKind,
  buildCancelStockPatch,
  buildSaleStockPatch,
  normalizeLineKind,
  splitPagamentosByGrossShares,
  validateLineKindForParent,
} from '../lib/saleLineKind.js';
import { FINANCE_CATEGORIES } from '../lib/financeCategories.js';

describe('saleLineKind', () => {
  it('normaliza line_kind', () => {
    expect(normalizeLineKind('aluguel')).toBe('rental');
    expect(normalizeLineKind(undefined)).toBe('sale');
  });

  it('valida tipo do produto pai', () => {
    expect(validateLineKindForParent('sale', 'rental').ok).toBe(false);
    expect(validateLineKindForParent('both', 'rental').ok).toBe(true);
    expect(validateLineKindForParent('rental', 'sale').ok).toBe(false);
  });

  it('disponível por pool dual', () => {
    const item = { sale_quantity: 2, rental_available: 5, rental_out: 1, current_quantity: 7 };
    expect(availableQuantityForLineKind(item, 'sale', 'both')).toBe(2);
    expect(availableQuantityForLineKind(item, 'rental', 'both')).toBe(5);
  });

  it('baixa venda no pool sale_quantity', () => {
    const item = { sale_quantity: 4, rental_available: 2, rental_out: 0 };
    expect(buildSaleStockPatch(item, 1, 'sale')).toMatchObject({
      sale_quantity: 3,
      rental_available: 2,
      rental_out: 0,
      current_quantity: 5,
    });
  });

  it('baixa aluguel entre pools disponível e emprestado', () => {
    const item = { sale_quantity: 1, rental_available: 3, rental_out: 0 };
    expect(buildSaleStockPatch(item, 2, 'rental')).toMatchObject({
      sale_quantity: 1,
      rental_available: 1,
      rental_out: 2,
      current_quantity: 2,
    });
  });

  it('cancelamento reverte pools', () => {
    const item = { sale_quantity: 1, rental_available: 1, rental_out: 2 };
    expect(buildCancelStockPatch(item, 1, 'rental')).toMatchObject({
      rental_available: 2,
      rental_out: 1,
      current_quantity: 3,
    });
  });

  it('divide pagamentos por gross de venda e aluguel', () => {
    const shares = splitPagamentosByGrossShares(
      [{ forma: 'pix', valor: 100, troco: 0 }],
      [
        { key: 'VENDA_PRODUTO', gross: 70 },
        { key: 'ALUGUEL_RECEITA', gross: 30 },
      ]
    );
    expect(shares.get('VENDA_PRODUTO')[0].valor).toBe(70);
    expect(shares.get('ALUGUEL_RECEITA')[0].valor).toBe(30);
  });

  it('ALUGUEL_RECEITA classifica como rental no DRE', () => {
    expect(FINANCE_CATEGORIES.ALUGUEL_RECEITA.type).toBe('rental');
  });
});
