import { describe, expect, it } from 'vitest';
import {
  getSaleFooterHint,
  isSaleCheckoutDirty,
  isStudentProductSaleDirty,
} from '../lib/saleModalDirty.js';

describe('isSaleCheckoutDirty', () => {
  it('returns false for empty checkout', () => {
    expect(isSaleCheckoutDirty({})).toBe(false);
  });

  it('returns true when cart has items', () => {
    expect(isSaleCheckoutDirty({ cart: [{ id: 1 }] })).toBe(true);
  });

  it('returns true when aluno or guest fields are filled', () => {
    expect(isSaleCheckoutDirty({ alunoId: 'abc' })).toBe(true);
    expect(isSaleCheckoutDirty({ clienteNome: 'João' })).toBe(true);
    expect(isSaleCheckoutDirty({ clienteTelefone: '(11) 99999-9999' })).toBe(true);
  });

  it('returns true for discount or deferred sale', () => {
    expect(isSaleCheckoutDirty({ descGeralCents: 100 })).toBe(true);
    expect(isSaleCheckoutDirty({ descGeralPct: 10 })).toBe(true);
    expect(isSaleCheckoutDirty({ deferredSale: true })).toBe(true);
  });
});

describe('isStudentProductSaleDirty', () => {
  it('returns true only when cart has items', () => {
    expect(isStudentProductSaleDirty([])).toBe(false);
    expect(isStudentProductSaleDirty([{ id: 1 }])).toBe(true);
  });
});

describe('getSaleFooterHint', () => {
  it('returns null while busy', () => {
    expect(getSaleFooterHint({ cartLength: 0, busy: true })).toBe(null);
  });

  it('hints empty cart', () => {
    expect(getSaleFooterHint({ cartLength: 0 })).toMatch(/item/i);
  });

  it('hints invalid payment when cart has items', () => {
    expect(getSaleFooterHint({ cartLength: 2, paymentValid: false })).toMatch(/pagamento/i);
  });

  it('returns null when receiveLater bypasses payment', () => {
    expect(getSaleFooterHint({ cartLength: 1, paymentValid: false, receiveLater: true })).toBe(null);
  });

  it('returns null when payment is valid', () => {
    expect(getSaleFooterHint({ cartLength: 1, paymentValid: true })).toBe(null);
  });
});
