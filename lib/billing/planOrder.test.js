import { describe, it, expect } from 'vitest';
import { comparePlanSlugs, isPlanUpgrade, isPlanDowngrade } from './planOrder.js';

describe('planOrder', () => {
  it('ordena starter < studio < pro', () => {
    expect(comparePlanSlugs('starter', 'pro')).toBeLessThan(0);
    expect(isPlanUpgrade('starter', 'studio')).toBe(true);
    expect(isPlanDowngrade('pro', 'starter')).toBe(true);
  });
});
