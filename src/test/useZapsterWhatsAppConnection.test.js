import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const waMocks = vi.hoisted(() => ({
  instancesGetCalls: 0,
  instancesPostCalls: 0,
  powerOnCalls: 0,
  restartCalls: 0,
  getDelayMs: 80,
  postDelayMs: 80
}));

vi.mock('../lib/appwrite', () => ({
  createSessionJwt: vi.fn().mockResolvedValue('test-jwt'),
  account: {
    createJWT: vi.fn().mockResolvedValue({ jwt: 'test-jwt' }),
  },
  realtime: {
    subscribe: vi.fn(() => Promise.resolve({ close: vi.fn() })),
  },
  DB_ID: 'test-db',
  ACADEMIES_COL: 'test-academies',
}));

vi.mock('../lib/billingBlockedFetch', () => ({
  fetchWithBillingGuard: vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = String(init?.method || 'GET').toUpperCase();

    if (u.includes('/api/zapster/instances') && method === 'GET' && !u.includes('action=')) {
      waMocks.instancesGetCalls += 1;
      await new Promise((r) => setTimeout(r, waMocks.getDelayMs));
      return {
        blocked: false,
        res: {
          ok: true,
          text: async () =>
            JSON.stringify({
              instance_id: 'inst-1',
              status: 'qrcode',
              zapster_status: 'open',
              qrcode: null,
            })
        }
      };
    }

    if (u.includes('/api/zapster/instances') && method === 'POST' && u.includes('action=recover')) {
      return {
        blocked: false,
        res: { ok: true, text: async () => JSON.stringify({ sucesso: true, recovered: false }) }
      };
    }

    if (u.includes('/api/zapster/instances') && method === 'POST' && u.includes('action=power-on')) {
      waMocks.powerOnCalls += 1;
      return { blocked: false, res: { ok: true, status: 204, text: async () => '' } };
    }

    if (u.includes('/api/zapster/instances') && method === 'POST' && u.includes('action=restart')) {
      waMocks.restartCalls += 1;
      return { blocked: false, res: { ok: true, status: 204, text: async () => '' } };
    }

    if (u.includes('/api/zapster/instances') && method === 'POST' && !u.includes('action=')) {
      waMocks.instancesPostCalls += 1;
      await new Promise((r) => setTimeout(r, waMocks.postDelayMs));
      return {
        blocked: false,
        res: {
          ok: true,
          text: async () =>
            JSON.stringify({
              sucesso: true,
              instance_id: 'inst-new',
              status: 'qrcode',
              qrcode: null
            })
        }
      };
    }

    return { blocked: false, res: { ok: true, text: async () => '{}' } };
  })
}));

vi.mock('../store/useUiStore', () => ({
  useUiStore: {
    getState: () => ({ addToast: vi.fn() })
  }
}));

describe('useZapsterWhatsAppConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    waMocks.instancesGetCalls = 0;
    waMocks.instancesPostCalls = 0;
    waMocks.powerOnCalls = 0;
    waMocks.restartCalls = 0;
    waMocks.getDelayMs = 80;
    waMocks.postDelayMs = 80;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetchWaInfo: ignora chamada paralela enquanto a primeira está em andamento', async () => {
    waMocks.getDelayMs = 200;
    const { useZapsterWhatsAppConnection } = await import('../hooks/useZapsterWhatsAppConnection.js');
    const { result } = renderHook(() => useZapsterWhatsAppConnection('acad-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    waMocks.instancesGetCalls = 0;

    let p1;
    let p2;
    await act(async () => {
      p1 = result.current.fetchWaInfo({ silent: true, quiet: true });
      p2 = result.current.fetchWaInfo({ silent: true, quiet: true });
    });
    await act(async () => {
      await Promise.all([p1, p2]);
    });

    expect(waMocks.instancesGetCalls).toBe(1);
    expect(result.current.waLoading).toBe(false);

    await act(async () => {
      await result.current.fetchWaInfo({ silent: true, quiet: true });
    });
    expect(waMocks.instancesGetCalls).toBe(2);
  });

  it('createWaInstance: duplo clique dispara apenas um POST de criação', async () => {
    const { useZapsterWhatsAppConnection } = await import('../hooks/useZapsterWhatsAppConnection.js');
    const { result } = renderHook(() => useZapsterWhatsAppConnection('acad-2'));

    await act(async () => {
      await Promise.all([result.current.createWaInstance(), result.current.createWaInstance()]);
    });

    expect(waMocks.instancesPostCalls).toBe(1);
    expect(result.current.isCreating).toBe(false);
  });

  it('powerOnInstance: timers cancelados no unmount não disparam fetchWaInfo extra', async () => {
    const { useZapsterWhatsAppConnection } = await import('../hooks/useZapsterWhatsAppConnection.js');

    const { result, unmount } = renderHook(() => useZapsterWhatsAppConnection('acad-3'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });

    let callsAfterPowerOn = waMocks.instancesGetCalls;
    await act(async () => {
      void result.current.powerOnInstance();
      await new Promise((r) => setTimeout(r, 200));
      callsAfterPowerOn = waMocks.instancesGetCalls;
    });

    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 4000));
    });

    expect(waMocks.powerOnCalls).toBe(1);
    // Pode haver +1 consulta imediata do polling enquanto o QR está visível após power-on.
    expect(waMocks.instancesGetCalls).toBeGreaterThanOrEqual(callsAfterPowerOn);
    expect(waMocks.instancesGetCalls).toBeLessThanOrEqual(callsAfterPowerOn + 1);
  });

  it('restartInstance: timers cancelados no unmount não disparam fetchWaInfo extra', async () => {
    const { useZapsterWhatsAppConnection } = await import('../hooks/useZapsterWhatsAppConnection.js');

    const { result, unmount } = renderHook(() => useZapsterWhatsAppConnection('acad-4'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    const callsAfterMount = waMocks.instancesGetCalls;

    await act(async () => {
      await result.current.restartInstance();
    });

    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2000));
    });

    expect(waMocks.restartCalls).toBe(1);
    // restart exibe QR → polling dispara uma consulta imediata; timers adiados são cancelados no unmount.
    expect(waMocks.instancesGetCalls).toBe(callsAfterMount + 1);
  });
});
