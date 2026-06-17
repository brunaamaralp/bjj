import { describe, it, expect } from 'vitest';
import {
  clampEntryCooldownMinutes,
  entryCooldownSinceIso,
  shouldBlockEntryForCooldown,
  CONTROLID_ENTRY_COOLDOWN_MAX,
} from '../../lib/controlidCooldown.js';

describe('controlidCooldown', () => {
  it('clampEntryCooldownMinutes: 0 desliga', () => {
    expect(clampEntryCooldownMinutes(0)).toBe(0);
    expect(clampEntryCooldownMinutes(-5)).toBe(0);
    expect(clampEntryCooldownMinutes('')).toBe(0);
  });

  it('clampEntryCooldownMinutes limita a 240', () => {
    expect(clampEntryCooldownMinutes(15)).toBe(15);
    expect(clampEntryCooldownMinutes(999)).toBe(CONTROLID_ENTRY_COOLDOWN_MAX);
  });

  it('entryCooldownSinceIso retorna null quando desligado', () => {
    expect(entryCooldownSinceIso(0)).toBeNull();
  });

  it('entryCooldownSinceIso calcula janela', () => {
    const now = Date.parse('2026-06-17T15:00:00.000Z');
    const since = entryCooldownSinceIso(15, now);
    expect(since).toBe('2026-06-17T14:45:00.000Z');
  });

  it('shouldBlockEntryForCooldown só bloqueia com janela ativa e presença recente', () => {
    expect(shouldBlockEntryForCooldown(0, true)).toBe(false);
    expect(shouldBlockEntryForCooldown(15, false)).toBe(false);
    expect(shouldBlockEntryForCooldown(15, true)).toBe(true);
  });
});
