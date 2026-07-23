import { describe, it, expect } from 'vitest';
import { resolveControlIdSyncBadgeMeta } from '../lib/controlIdSyncBadgeMeta.js';

describe('controlIdSyncBadgeMeta', () => {
  it('prioriza bloqueio por inadimplência (só status, sem ação)', () => {
    const meta = resolveControlIdSyncBadgeMeta(
      { overdue: true, controlid_synced: false, photo_url: 'http://x' },
      true
    );
    expect(meta.label).toBe('Catraca: bloqueado');
    expect(meta.canSync).toBe(false);
    expect(meta.actionLabel).toBeUndefined();
  });

  it('pendente com foto — status + ação Sincronizar', () => {
    const meta = resolveControlIdSyncBadgeMeta(
      { overdue: false, controlid_synced: false, photo_url: 'http://x' },
      true
    );
    expect(meta.label).toBe('Catraca: pendente');
    expect(meta.canSync).toBe(true);
    expect(meta.actionLabel).toBe('Sincronizar');
    expect(meta.actionAriaLabel).toMatch(/sincronizar/i);
  });

  it('OK sincronizado — só status', () => {
    const meta = resolveControlIdSyncBadgeMeta(
      { controlid_synced: true, photo_url: 'http://x' },
      false
    );
    expect(meta.label).toBe('Catraca: OK');
    expect(meta.canSync).toBe(false);
    expect(meta.actionLabel).toBeUndefined();
  });

  it('erro — status + ação para tentar de novo', () => {
    const meta = resolveControlIdSyncBadgeMeta(
      { controlid_sync_error: 'timeout', photo_url: 'http://x' },
      false
    );
    expect(meta.label).toBe('Catraca: erro');
    expect(meta.canSync).toBe(true);
    expect(meta.actionLabel).toBe('Sincronizar');
  });
});
