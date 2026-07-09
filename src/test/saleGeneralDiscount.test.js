import { describe, it, expect } from 'vitest';
import {
  applySaleGeneralDiscountToUnitPrice,
  computeSaleGeneralDiscount,
  roundSaleMoney,
} from '../../src/lib/saleGeneralDiscount.js';

describe('saleGeneralDiscount', () => {
  it('roundSaleMoney arredonda em 2 casas', () => {
    expect(roundSaleMoney(10.005)).toBe(10.01);
    expect(roundSaleMoney(10.004)).toBe(10);
  });

  it('desconto em valor reduz total e fator proporcional', () => {
    const r = computeSaleGeneralDiscount(200, { tipo: 'valor', cents: 5000 });
    expect(r.descontoGeralValor).toBe(50);
    expect(r.totalFinal).toBe(150);
    expect(r.totalFinalCents).toBe(15000);
    expect(r.fatorGeral).toBe(0.75);
    expect(r.discountDisplayValue).toBe(50);
  });

  it('desconto percentual', () => {
    const r = computeSaleGeneralDiscount(200, { tipo: 'percent', pct: 10 });
    expect(r.totalFinal).toBe(180);
    expect(r.totalFinalCents).toBe(18000);
  });

  it('desconto em valor não excede subtotal', () => {
    const r = computeSaleGeneralDiscount(100, { tipo: 'valor', cents: 20000 });
    expect(r.totalFinal).toBe(0);
    expect(r.fatorGeral).toBe(0);
  });

  it('applySaleGeneralDiscountToUnitPrice distribui desconto na linha', () => {
    expect(applySaleGeneralDiscountToUnitPrice(100, 0.75)).toBe(75);
    expect(applySaleGeneralDiscountToUnitPrice(100, 1)).toBe(100);
  });
});
