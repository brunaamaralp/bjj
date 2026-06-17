import { describe, it, expect } from 'vitest';
import { resolveControlIdSyncBadgeMeta } from '../lib/controlIdSyncBadgeMeta.js';

describe('controlIdSyncBadgeMeta', () => {
  it('prioriza bloqueio por inadimplência', () => {
    const meta = resolveControlIdSyncBadgeMeta(
      { overdue: true, controlid_synced: false, photo_url: 'http://x' },
      true
    );
    expect(meta.label).toBe('Catraca: bloqueado');
    expect(meta.canSync).toBe(false);
  });

  it('pendente quando não inadimplente e com foto', () => {
    const meta = resolveControlIdSyncBadgeMeta(
      { overdue: false, controlid_synced: false, photo_url: 'http://x' },
      true
    );
    expect(meta.label).toBe('Catraca: pendente');
    expect(meta.canSync).toBe(true);
  });
});
