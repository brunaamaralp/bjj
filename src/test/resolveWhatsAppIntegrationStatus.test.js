import { describe, expect, it } from 'vitest';
import { resolveWhatsAppIntegrationStatus } from '../lib/resolveWhatsAppIntegrationStatus.js';

describe('resolveWhatsAppIntegrationStatus', () => {
  it('API connected prevalece sobre zapster_status desatualizado no doc', () => {
    expect(resolveWhatsAppIntegrationStatus('disconnected', 'connected', 'inst-1')).toBe('connected');
    expect(resolveWhatsAppIntegrationStatus('disconnected', 'online', 'inst-1')).toBe('connected');
  });

  it('offline da API é estado transitório', () => {
    expect(resolveWhatsAppIntegrationStatus('connected', 'offline', 'inst-1')).toBe('offline');
  });

  it('unknown da API é transitório', () => {
    expect(resolveWhatsAppIntegrationStatus('disconnected', 'unknown', 'inst-1')).toBe('unknown');
  });

  it('sem instância retorna disconnected', () => {
    expect(resolveWhatsAppIntegrationStatus('', '', null)).toBe('disconnected');
    expect(resolveWhatsAppIntegrationStatus('disconnected', '', '')).toBe('disconnected');
  });

  it('doc prevalece quando API não é connected nem transitório', () => {
    expect(resolveWhatsAppIntegrationStatus('connected', 'disconnected', 'inst-1')).toBe('connected');
  });
});
