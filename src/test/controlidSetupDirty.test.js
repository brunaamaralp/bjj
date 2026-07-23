import { describe, it, expect } from 'vitest';
import { isControlIdConfigDirty, snapshotControlIdConfigForm } from '../lib/controlidSetupDirty.js';

describe('controlidSetupDirty', () => {
  const base = {
    enabled: true,
    ip: '192.168.1.100',
    port: '80',
    username: 'admin',
    password: '',
    portalId: '1',
    relayUrl: '',
    entryCooldownMinutes: '0',
    blockOverdueAccess: false,
  };

  it('não está dirty quando igual ao snapshot', () => {
    const snap = snapshotControlIdConfigForm(base);
    expect(isControlIdConfigDirty(base, snap)).toBe(false);
  });

  it('detecta mudança de IP', () => {
    const snap = snapshotControlIdConfigForm(base);
    expect(isControlIdConfigDirty({ ...base, ip: '10.0.0.1' }, snap)).toBe(true);
  });

  it('detecta senha digitada (mesmo com snapshot vazio)', () => {
    const snap = snapshotControlIdConfigForm(base);
    expect(isControlIdConfigDirty({ ...base, password: 'nova' }, snap)).toBe(true);
  });

  it('detecta toggle de bloqueio inadimplentes', () => {
    const snap = snapshotControlIdConfigForm(base);
    expect(isControlIdConfigDirty({ ...base, blockOverdueAccess: true }, snap)).toBe(true);
  });
});
