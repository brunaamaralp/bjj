import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assertClientBillingMutationsAllowed,
  BillingGateClientError,
} from '../lib/billingGateClient.js';

describe('billingGateClient', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BILLING_ENABLED', 'true');
  });

  it('permite quando billing desligado', () => {
    vi.stubEnv('VITE_BILLING_ENABLED', 'false');
    expect(() => assertClientBillingMutationsAllowed({ accessLevel: 'none' })).not.toThrow();
  });

  it('permite accessLevel full', () => {
    expect(() => assertClientBillingMutationsAllowed({ accessLevel: 'full' })).not.toThrow();
  });

  it('não bloqueia enquanto billingAccess é null', () => {
    expect(() => assertClientBillingMutationsAllowed(null)).not.toThrow();
  });

  it('bloqueia past_due (limited)', () => {
    expect(() => assertClientBillingMutationsAllowed({ accessLevel: 'limited' })).toThrow(
      BillingGateClientError
    );
  });

  it('bloqueia inactive (none)', () => {
    expect(() => assertClientBillingMutationsAllowed({ accessLevel: 'none' })).toThrow(
      BillingGateClientError
    );
  });
});
