import { describe, expect, it } from 'vitest';
import {
  formatPlanLabel,
  mergeRestoredPlans,
  parsePlansCsv,
  parsePlansJson,
} from '../lib/restorePlanDefinitions.js';

describe('restorePlanDefinitions', () => {
  it('parsePlansCsv reads header and rows', () => {
    const csv = `name,price,applyCardFee,isExempt
Anual adulto,1200,false,false
Mensal,150,sim,false`;
    const plans = parsePlansCsv(csv);
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ name: 'Anual adulto', price: 1200, applyCardFee: false });
    expect(plans[1]).toMatchObject({ name: 'Mensal', price: 150, applyCardFee: true });
  });

  it('parsePlansJson accepts array', () => {
    const plans = parsePlansJson('[{"name":"Diária","price":50}]');
    expect(plans[0].name).toBe('Diária');
  });

  it('mergeRestoredPlans adds new plans without overwriting', () => {
    const existing = [{ name: 'Mensal', price: 200, applyCardFee: false }];
    const incoming = [
      { name: 'Mensal', price: 999 },
      { name: 'Anual', price: 1200 },
    ];
    const result = mergeRestoredPlans(existing, incoming);
    expect(result.added).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.plans.find((p) => p.name === 'Mensal').price).toBe(200);
    expect(result.plans.find((p) => p.name === 'Anual').price).toBe(1200);
  });

  it('mergeRestoredPlans can overwrite prices', () => {
    const existing = [{ name: 'Mensal', price: 200 }];
    const incoming = [{ name: 'Mensal', price: 220 }];
    const result = mergeRestoredPlans(existing, incoming, { overwritePrices: true });
    expect(result.updated).toHaveLength(1);
    expect(result.plans[0].price).toBe(220);
  });

  it('formatPlanLabel shows price and isento', () => {
    expect(formatPlanLabel({ name: 'X', price: 100 })).toContain('R$');
    expect(formatPlanLabel({ name: 'Bolsa', isExempt: true })).toContain('Isento');
  });
});
