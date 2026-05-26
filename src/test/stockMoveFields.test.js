import { describe, it, expect } from 'vitest';
import {
  derivePaymentStatusAtMove,
  paymentMethodFromPagamentos,
  cmvUnitFromTotals,
} from '../../lib/server/stockMoveFields.js';

describe('stockMoveFields', () => {
  it('derivePaymentStatusAtMove', () => {
    expect(derivePaymentStatusAtMove([], 100)).toBe('paid');
    expect(derivePaymentStatusAtMove([{ forma: 'pix', valor: 100 }], 100)).toBe('paid');
    expect(derivePaymentStatusAtMove([{ forma: 'pix', valor: 50 }], 100)).toBe('partial');
    expect(derivePaymentStatusAtMove([{ forma: 'pix', valor: 0 }], 100)).toBe('pending');
  });

  it('paymentMethodFromPagamentos', () => {
    expect(paymentMethodFromPagamentos([{ forma: 'pix', valor: 10 }])).toBe('pix');
    expect(paymentMethodFromPagamentos([])).toBeNull();
  });

  it('cmvUnitFromTotals', () => {
    expect(cmvUnitFromTotals(20, 2, {})).toBe(10);
    expect(cmvUnitFromTotals(null, 0, { average_cost: 5 })).toBe(5);
  });
});
