import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  decryptPagbankToken,
  decryptPagbankWebhookSecret,
  encryptPagbankToken,
  encryptPagbankWebhookSecret,
} from '../pagbankCrypto.js';

const TEST_KEY = 'pagbank-test-encryption-key-32chars!!';

describe('pagbankCrypto', () => {
  beforeEach(() => {
    process.env.PAGBANK_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.PAGBANK_ENCRYPTION_KEY;
  });

  it('round-trips token encryption', () => {
    const plain = 'tok_live_abc123_secret';
    const encrypted = encryptPagbankToken(plain);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe(plain);
    expect(decryptPagbankToken(encrypted)).toBe(plain);
  });

  it('round-trips webhook secret encryption', () => {
    const plain = 'whsec-uuid-style-secret-value';
    const encrypted = encryptPagbankWebhookSecret(plain);
    expect(decryptPagbankWebhookSecret(encrypted)).toBe(plain);
  });

  it('empty input returns empty string without key', () => {
    expect(encryptPagbankToken('')).toBe('');
    expect(decryptPagbankToken('')).toBe('');
  });

  it('throws when key is missing', () => {
    delete process.env.PAGBANK_ENCRYPTION_KEY;
    expect(() => encryptPagbankToken('tok')).toThrow(/PAGBANK_ENCRYPTION_KEY/);
  });

  it('different IVs produce different ciphertext', () => {
    const a = encryptPagbankToken('same-token');
    const b = encryptPagbankToken('same-token');
    expect(a).not.toBe(b);
    expect(decryptPagbankToken(a)).toBe('same-token');
    expect(decryptPagbankToken(b)).toBe('same-token');
  });
});
