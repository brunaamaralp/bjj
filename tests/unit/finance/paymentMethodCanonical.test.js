import { describe, it, expect } from 'vitest';
import {
  canonicalPaymentMethodKey,
  canonicalPaymentMethodKeyFromInput,
  toStorageDialectMethod,
} from '../../../src/lib/paymentMethods.js';

const CANONICAL_CASES = [
  ['cartão_crédito', 'cartao_credito'],
  ['cartao_credito', 'cartao_credito'],
  ['credito', 'cartao_credito'],
  ['cartão crédito', 'cartao_credito'],
  ['cartão_débito', 'cartao_debito'],
  ['debito', 'cartao_debito'],
  ['transferência', 'transferencia'],
  ['pix', 'pix'],
];

describe('canonicalPaymentMethodKey', () => {
  it.each(CANONICAL_CASES)('%s → %s', (input, expected) => {
    expect(canonicalPaymentMethodKey(input)).toBe(expected);
  });
});

describe('canonicalPaymentMethodKeyFromInput', () => {
  it('normaliza espaços em variantes NL', () => {
    expect(canonicalPaymentMethodKeyFromInput('cartão crédito')).toBe('cartao_credito');
    expect(canonicalPaymentMethodKeyFromInput('Cartão Débito')).toBe('cartao_debito');
  });
});

describe('toStorageDialectMethod', () => {
  it('round-trip acentuado para mensalidades', () => {
    expect(toStorageDialectMethod('cartao_credito')).toBe('cartão_crédito');
    expect(toStorageDialectMethod('cartão_crédito')).toBe('cartão_crédito');
    expect(toStorageDialectMethod('transferencia')).toBe('transferência');
    expect(toStorageDialectMethod('pix')).toBe('pix');
  });
});

describe('cross-module parity', () => {
  it('normalizePaymentForma aligns with canonical', async () => {
    const { normalizePaymentForma } = await import('../../../src/lib/salePayments.js');
    expect(normalizePaymentForma('cartão_crédito')).toBe('cartao_credito');
    expect(normalizePaymentForma('cartão crédito')).toBe('cartao_credito');
  });
});

describe('storage dialect UI helpers', () => {
  it('storageDialectPaymentMethodOptions usa dialect acentuado', async () => {
    const {
      storageDialectPaymentMethodOptions,
      STORAGE_CREDIT_METHOD,
      orderedStorageDialectMethodsForModal,
    } = await import('../../../src/lib/paymentMethods.js');
    const opts = storageDialectPaymentMethodOptions();
    expect(opts.find((o) => o.canonical === 'cartao_credito')?.value).toBe(STORAGE_CREDIT_METHOD);
    expect(orderedStorageDialectMethodsForModal()[0].value).toBe('pix');
  });

  it('normalizeToStorageDialect aceita canônico e dialect', async () => {
    const { normalizeToStorageDialect, STORAGE_CREDIT_METHOD } = await import(
      '../../../src/lib/paymentMethods.js'
    );
    expect(normalizeToStorageDialect('cartao_credito')).toBe(STORAGE_CREDIT_METHOD);
    expect(normalizeToStorageDialect('cartão_crédito')).toBe(STORAGE_CREDIT_METHOD);
  });
});
