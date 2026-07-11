import { describe, expect, it, vi } from 'vitest';
import {
  closeAppwriteRealtimeSubscription,
  installAppwriteRealtimeErrorGuard,
  isBenignAppwriteRealtimeError,
} from '../lib/appwriteRealtime.js';

describe('appwriteRealtime', () => {
  it('isBenignAppwriteRealtimeError detecta falhas de websocket', () => {
    expect(isBenignAppwriteRealtimeError(new Error('WebSocket error'))).toBe(true);
    expect(isBenignAppwriteRealtimeError('websocket closed')).toBe(true);
    expect(isBenignAppwriteRealtimeError(new Error('network'))).toBe(false);
  });

  it('installAppwriteRealtimeErrorGuard registra e remove listener', () => {
    const remove = installAppwriteRealtimeErrorGuard();
    expect(typeof remove).toBe('function');
    remove();
  });

  it('closeAppwriteRealtimeSubscription ignora close ausente', () => {
    expect(() => closeAppwriteRealtimeSubscription(null)).not.toThrow();
    const close = vi.fn();
    closeAppwriteRealtimeSubscription({ close });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
