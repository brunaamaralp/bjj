import { describe, it, expect } from 'vitest';
import { resolvePlanPriceBackfillPatch } from '../studentPlanPriceBackfill.js';

describe('resolvePlanPriceBackfillPatch', () => {
  const cfg = { plans: [{ name: 'Mensal', price: 200 }] };

  it('skips when snapshot exists', () => {
    expect(resolvePlanPriceBackfillPatch({ plan: 'Mensal', plan_price: 180 }, cfg).skip).toBe(true);
  });

  it('patches from catalog', () => {
    expect(resolvePlanPriceBackfillPatch({ plan: 'Mensal' }, cfg)).toEqual({
      skip: false,
      patch: { plan_price: 200 },
    });
  });

  it('skips orphan plan', () => {
    expect(resolvePlanPriceBackfillPatch({ plan: 'Velho' }, cfg).reason).toBe('plan_not_in_catalog');
  });
});
