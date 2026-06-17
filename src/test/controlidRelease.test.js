import { describe, it, expect } from 'vitest';
import {
  validateReleaseReason,
  normalizeReleaseReason,
  summarizeReleaseReason,
  CONTROLID_RELEASE_REASON_MIN,
  CONTROLID_RELEASE_REASON_MAX,
} from '../../lib/controlidRelease.js';

describe('controlidRelease', () => {
  it('normalizeReleaseReason faz trim', () => {
    expect(normalizeReleaseReason('  visitante  ')).toBe('visitante');
  });

  it('validateReleaseReason exige comprimento mínimo', () => {
    expect(validateReleaseReason('ab')).toMatch(/3/);
    expect(validateReleaseReason('abc')).toBeNull();
  });

  it('validateReleaseReason rejeita texto longo', () => {
    const long = 'a'.repeat(CONTROLID_RELEASE_REASON_MAX + 1);
    expect(validateReleaseReason(long)).toMatch(/máximo/);
  });

  it('summarizeReleaseReason trunca com reticências', () => {
    const long = 'x'.repeat(80);
    const out = summarizeReleaseReason(long, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('...')).toBe(true);
  });

  it('constantes de tamanho são coerentes', () => {
    expect(CONTROLID_RELEASE_REASON_MIN).toBe(3);
    expect(CONTROLID_RELEASE_REASON_MAX).toBe(500);
  });
});
