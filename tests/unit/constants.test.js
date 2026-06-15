import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertHumanHandoffEnvOnBoot,
  getHumanHandoffHoursForServer,
  resolveHumanHandoffHours,
} from '../../lib/constants.js';

describe('resolveHumanHandoffHours', () => {
  it('undefined → default 6', () => {
    expect(resolveHumanHandoffHours(undefined)).toBe(6);
  });

  it("'0' → default 6 (inválido)", () => {
    expect(resolveHumanHandoffHours('0')).toBe(6);
  });

  it("'12' → 12", () => {
    expect(resolveHumanHandoffHours('12')).toBe(12);
  });

  it("'abc' → default 6", () => {
    expect(resolveHumanHandoffHours('abc')).toBe(6);
  });
});

describe('getHumanHandoffHoursForServer', () => {
  const original = process.env.HUMAN_HANDOFF_HOURS;

  afterEach(() => {
    if (original === undefined) delete process.env.HUMAN_HANDOFF_HOURS;
    else process.env.HUMAN_HANDOFF_HOURS = original;
  });

  it("com process.env.HUMAN_HANDOFF_HOURS='4' → 4", () => {
    process.env.HUMAN_HANDOFF_HOURS = '4';
    expect(getHumanHandoffHoursForServer()).toBe(4);
  });
});

describe('assertHumanHandoffEnvOnBoot', () => {
  const envBackup = {
    HUMAN_HANDOFF_HOURS: process.env.HUMAN_HANDOFF_HOURS,
    VITE_HUMAN_HANDOFF_HOURS: process.env.VITE_HUMAN_HANDOFF_HOURS,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it('server=client → true', () => {
    process.env.HUMAN_HANDOFF_HOURS = '8';
    process.env.VITE_HUMAN_HANDOFF_HOURS = '8';
    expect(assertHumanHandoffEnvOnBoot()).toBe(true);
  });

  it('server≠client → false + console.error', () => {
    process.env.HUMAN_HANDOFF_HOURS = '4';
    process.env.VITE_HUMAN_HANDOFF_HOURS = '6';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(assertHumanHandoffEnvOnBoot()).toBe(false);
    expect(errorSpy).toHaveBeenCalledOnce();

    const payload = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(payload.event).toBe('handoff_env_mismatch');
    expect(payload.server_hours).toBe(4);
    expect(payload.client_hours).toBe(6);
  });
});
