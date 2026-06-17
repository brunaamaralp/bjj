import { describe, it, expect } from 'vitest';
import { readAverageCost, resolveCmvUnitCost } from '../lib/weightedAverageCost.js';

describe('resolveCmvUnitCost', () => {
  it('prefere average_cost', () => {
    expect(resolveCmvUnitCost({ average_cost: 12, last_purchase_cost: 8, cost_price: 5 })).toBe(12);
  });

  it('usa last_purchase_cost quando médio é zero', () => {
    expect(resolveCmvUnitCost({ average_cost: 0, last_purchase_cost: 8, cost_price: 5 })).toBe(8);
  });

  it('usa cost_price do catálogo como fallback', () => {
    expect(resolveCmvUnitCost({ average_cost: 0, cost_price: 15 })).toBe(15);
    expect(resolveCmvUnitCost({ preco_custo: 9 })).toBe(9);
  });

  it('retorna zero sem custo configurado', () => {
    expect(resolveCmvUnitCost({})).toBe(0);
    expect(readAverageCost({})).toBe(0);
  });
});
