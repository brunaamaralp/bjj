import { describe, it, expect } from 'vitest';
import {
  readControlIdConfig,
  mergeControlIdIntoSettings,
  normalizeRelayUrl,
  validateRelayUrl,
} from '../../lib/controlidSettings.js';
import { formatControlIdLastSync } from '../lib/controlidDisplay.js';

describe('controlidSettings', () => {
  it('defaults incluem relay_url e last_sync vazios', () => {
    const cfg = readControlIdConfig(null);
    expect(cfg.relay_url).toBe('');
    expect(cfg.last_sync).toBe('');
    expect(cfg.entry_cooldown_minutes).toBe(0);
    expect(cfg.block_overdue_access).toBe(false);
    expect(cfg.portal_id).toBe(1);
  });

  it('lê relay_url e last_sync do JSON da academia', () => {
    const settings = {
      controlid: {
        enabled: true,
        ip: '10.0.0.5',
        port: 80,
        username: 'admin',
        password: 'enc',
        portal_id: 2,
        relay_url: 'http://192.168.1.50:4000/',
        last_sync: '2026-06-17T14:32:00.000Z',
        entry_cooldown_minutes: 30,
      },
    };
    const cfg = readControlIdConfig(settings);
    expect(cfg.relay_url).toBe('http://192.168.1.50:4000');
    expect(cfg.last_sync).toBe('2026-06-17T14:32:00.000Z');
    expect(cfg.entry_cooldown_minutes).toBe(30);
  });

  it('mergeControlIdIntoSettings preserva last_sync quando não informado', () => {
    const base = {
      controlid: {
        enabled: true,
        ip: '10.0.0.5',
        last_sync: '2026-06-01T10:00:00.000Z',
      },
    };
    const merged = mergeControlIdIntoSettings(base, { relay_url: 'http://192.168.1.1:4000' });
    expect(merged.controlid.last_sync).toBe('2026-06-01T10:00:00.000Z');
    expect(merged.controlid.relay_url).toBe('http://192.168.1.1:4000');
  });

  it('normalizeRelayUrl remove barra final', () => {
    expect(normalizeRelayUrl('http://host:4000/')).toBe('http://host:4000');
    expect(normalizeRelayUrl('  ')).toBe('');
  });

  it('validateRelayUrl aceita vazio e http(s)', () => {
    expect(validateRelayUrl('')).toBeNull();
    expect(validateRelayUrl('http://192.168.1.1:4000')).toBeNull();
    expect(validateRelayUrl('ftp://x')).toMatch(/http/);
    expect(validateRelayUrl('não-é-url')).toBeTruthy();
  });
});

describe('formatControlIdLastSync', () => {
  it('retorna mensagem padrão quando vazio', () => {
    expect(formatControlIdLastSync('')).toBe('Nunca sincronizado');
  });

  it('formata ISO em pt-BR', () => {
    const out = formatControlIdLastSync('2026-06-17T14:32:00.000Z');
    expect(out).toContain('17/06/2026');
    expect(out).toContain('às');
  });
});
