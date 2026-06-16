import { describe, expect, it } from 'vitest';
import { isWhatsAppIntegrationConnected } from '../lib/whatsappIntegrationState.js';

describe('isWhatsAppIntegrationConnected', () => {
  it('returns false while status not checked', () => {
    expect(isWhatsAppIntegrationConnected('connected', false)).toBe(false);
    expect(isWhatsAppIntegrationConnected('disconnected', false)).toBe(false);
  });

  it('returns true only when checked and connected', () => {
    expect(isWhatsAppIntegrationConnected('connected', true)).toBe(true);
    expect(isWhatsAppIntegrationConnected('disconnected', true)).toBe(false);
    expect(isWhatsAppIntegrationConnected('', true)).toBe(false);
  });
});
