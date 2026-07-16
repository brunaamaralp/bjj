import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  closeAppwriteRealtimeSubscription,
  installAppwriteRealtimeErrorGuard,
  isBenignAppwriteRealtimeError,
  resetAppwriteRealtimeSharedState,
  subscribeAppwriteRealtime,
} from '../lib/appwriteRealtime.js';

vi.mock('../lib/appwrite.js', () => ({
  syncClientSessionJwt: vi.fn().mockResolvedValue('test-jwt'),
}));

describe('appwriteRealtime', () => {
  beforeEach(() => {
    resetAppwriteRealtimeSharedState();
  });

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

  it('subscribeAppwriteRealtime compartilha uma subscription por canal', async () => {
    const close = vi.fn();
    const sdkSubscribe = vi.fn((_channel, cb) => {
      sdkSubscribe._cb = cb;
      return Promise.resolve({ close });
    });
    const client = { subscribe: sdkSubscribe };
    const onA = vi.fn();
    const onB = vi.fn();

    const subA = await subscribeAppwriteRealtime(client, 'channel-1', onA);
    const subB = await subscribeAppwriteRealtime(client, 'channel-1', onB);

    expect(sdkSubscribe).toHaveBeenCalledTimes(1);
    expect(subA).toBeTruthy();
    expect(subB).toBeTruthy();

    sdkSubscribe._cb({ payload: { id: '1' } });
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledTimes(1);

    closeAppwriteRealtimeSubscription(subA);
    expect(close).not.toHaveBeenCalled();

    closeAppwriteRealtimeSubscription(subB);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('subscribeAppwriteRealtime fecha e permite reconectar no mesmo canal', async () => {
    const close = vi.fn();
    const sdkSubscribe = vi.fn((_channel, cb) => {
      sdkSubscribe._cb = cb;
      return Promise.resolve({ close });
    });
    const client = { subscribe: sdkSubscribe };

    const sub = await subscribeAppwriteRealtime(client, 'channel-reconnect', vi.fn());
    closeAppwriteRealtimeSubscription(sub);
    expect(close).toHaveBeenCalledTimes(1);

    await subscribeAppwriteRealtime(client, 'channel-reconnect', vi.fn());
    expect(sdkSubscribe).toHaveBeenCalledTimes(2);
  });
});
