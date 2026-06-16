import { describe, it, expect } from 'vitest';
import {
  isPlanFeeEligiblePaymentMethod,
  isCardPaymentMethod,
} from '../../../src/lib/paymentMethods.js';

describe('isPlanFeeEligiblePaymentMethod', () => {
  it('inclui PIX e cartões', () => {
    expect(isPlanFeeEligiblePaymentMethod('pix')).toBe(true);
    expect(isPlanFeeEligiblePaymentMethod('cartao_credito')).toBe(true);
    expect(isPlanFeeEligiblePaymentMethod('cartao_debito')).toBe(true);
  });

  it('exclui dinheiro e transferência', () => {
    expect(isPlanFeeEligiblePaymentMethod('dinheiro')).toBe(false);
    expect(isPlanFeeEligiblePaymentMethod('transferencia')).toBe(false);
    expect(isPlanFeeEligiblePaymentMethod('outro')).toBe(false);
  });

  it('isCardPaymentMethod não inclui PIX', () => {
    expect(isCardPaymentMethod('pix')).toBe(false);
    expect(isCardPaymentMethod('cartao_credito')).toBe(true);
  });
});
