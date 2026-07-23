import { describe, it, expect } from 'vitest';
import {
  getStudentAgreedPlanPrice,
  snapshotPlanPriceFromCatalog,
  resolveStudentPlanBasePrice,
  resolveStudentPlanFinalPrice,
} from '../lib/planBilling.js';

describe('plan price snapshot', () => {
  const financeConfig = {
    plans: [
      { name: 'Mensal', price: 250 },
      { name: 'Isento', price: 0, isExempt: true },
    ],
  };

  it('getStudentAgreedPlanPrice returns null when absent', () => {
    expect(getStudentAgreedPlanPrice({})).toBeNull();
    expect(getStudentAgreedPlanPrice({ plan_price: '' })).toBeNull();
    expect(getStudentAgreedPlanPrice({ planPrice: null })).toBeNull();
  });

  it('getStudentAgreedPlanPrice accepts zero', () => {
    expect(getStudentAgreedPlanPrice({ plan_price: 0 })).toBe(0);
  });

  it('snapshotPlanPriceFromCatalog copies catalog price', () => {
    expect(snapshotPlanPriceFromCatalog(financeConfig, 'Mensal')).toBe(250);
    expect(snapshotPlanPriceFromCatalog(financeConfig, 'Isento')).toBe(0);
    expect(snapshotPlanPriceFromCatalog(financeConfig, 'Fantasma')).toBeNull();
  });

  it('resolveStudentPlanFinalPrice prefers student snapshot over catalog', () => {
    const student = { plan: 'Mensal', plan_price: 200, discount_amount: 0 };
    expect(resolveStudentPlanFinalPrice(student, financeConfig)).toBe(200);
  });

  it('resolveStudentPlanFinalPrice applies discount on snapshot', () => {
    const student = {
      plan: 'Mensal',
      plan_price: 200,
      discount_type: 'fixed',
      discount_amount: 30,
    };
    expect(resolveStudentPlanFinalPrice(student, financeConfig)).toBe(170);
  });

  it('resolveStudentPlanFinalPrice falls back to catalog without snapshot', () => {
    const student = { plan: 'Mensal' };
    expect(resolveStudentPlanFinalPrice(student, financeConfig)).toBe(250);
  });

  it('resolveStudentPlanBasePrice returns snapshot when present', () => {
    expect(resolveStudentPlanBasePrice({ plan: 'Mensal', plan_price: 200 }, financeConfig)).toBe(200);
  });

  it('exempt plan final price is 0 even with snapshot', () => {
    const student = { plan: 'Isento', plan_price: 99 };
    expect(resolveStudentPlanFinalPrice(student, financeConfig)).toBe(0);
  });
});
