import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { humanHandoffIsActive, humanHandoffUntilFromMs } from '../../lib/humanHandoffUntil.js';

describe('humanHandoffIsActive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('null → false (IA responde)', () => {
    expect(humanHandoffIsActive(null)).toBe(false);
  });

  it('string vazia → false', () => {
    expect(humanHandoffIsActive('')).toBe(false);
  });

  it('data no passado → false', () => {
    const until = humanHandoffUntilFromMs(Date.now() - 60_000);
    expect(humanHandoffIsActive(until)).toBe(false);
  });

  it('data no futuro → true', () => {
    const until = humanHandoffUntilFromMs(Date.now() + 60_000);
    expect(humanHandoffIsActive(until)).toBe(true);
  });

  it('data exatamente agora (edge) → false (já expirou)', () => {
    const until = humanHandoffUntilFromMs(Date.now());
    expect(humanHandoffIsActive(until)).toBe(false);
  });
});
