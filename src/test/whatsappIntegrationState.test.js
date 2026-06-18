import { describe, expect, it } from 'vitest';
import {
  isWhatsAppIntegrationConnected,
  isWhatsAppIntegrationDisconnected,
  isWhatsAppIntegrationPaused,
} from '../lib/whatsappIntegrationState.js';

describe('isWhatsAppIntegrationConnected', () => {
  it('returns false while status not checked', () => {
    expect(isWhatsAppIntegrationConnected('connected', false)).toBe(false);
    expect(isWhatsAppIntegrationConnected('disconnected', false)).toBe(false);
  });

  it('returns true only when checked and connected', () => {
    expect(isWhatsAppIntegrationConnected('connected', true)).toBe(true);
    expect(isWhatsAppIntegrationConnected('online', true)).toBe(true);
    expect(isWhatsAppIntegrationConnected('disconnected', true)).toBe(false);
    expect(isWhatsAppIntegrationConnected('', true)).toBe(false);
  });
});

describe('isWhatsAppIntegrationPaused', () => {
  it('returns false while status not checked', () => {
    expect(isWhatsAppIntegrationPaused('offline', false)).toBe(false);
  });

  it('returns true only for offline confirmado', () => {
    expect(isWhatsAppIntegrationPaused('offline', true)).toBe(true);
    expect(isWhatsAppIntegrationPaused('connected', true)).toBe(false);
    expect(isWhatsAppIntegrationPaused('disconnected', true)).toBe(false);
  });
});

describe('isWhatsAppIntegrationDisconnected', () => {
  it('returns false while status not checked', () => {
    expect(isWhatsAppIntegrationDisconnected('disconnected', false)).toBe(false);
  });

  it('returns false when connected', () => {
    expect(isWhatsAppIntegrationDisconnected('connected', true)).toBe(false);
    expect(isWhatsAppIntegrationDisconnected('online', true)).toBe(false);
  });

  it('returns false during transient re-check states', () => {
    expect(isWhatsAppIntegrationDisconnected('connecting', true)).toBe(false);
    expect(isWhatsAppIntegrationDisconnected('syncing', true)).toBe(false);
    expect(isWhatsAppIntegrationDisconnected('unknown', true)).toBe(false);
  });

  it('returns false for pausa operacional (offline)', () => {
    expect(isWhatsAppIntegrationDisconnected('offline', true)).toBe(false);
  });

  it('returns true for desconexão confirmada', () => {
    expect(isWhatsAppIntegrationDisconnected('disconnected', true)).toBe(true);
    expect(isWhatsAppIntegrationDisconnected('error', true)).toBe(true);
    expect(isWhatsAppIntegrationDisconnected('failed', true)).toBe(true);
  });

  it('returns false during QR / pareamento', () => {
    expect(isWhatsAppIntegrationDisconnected('qrcode', true)).toBe(false);
    expect(isWhatsAppIntegrationDisconnected('open', true)).toBe(false);
    expect(isWhatsAppIntegrationDisconnected('scanning', true)).toBe(false);
  });
});
