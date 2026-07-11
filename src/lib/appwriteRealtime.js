/**
 * Appwrite Realtime — subscribe seguro e supressão de rejeições benignas do SDK.
 */

export function isBenignAppwriteRealtimeError(reason) {
  const msg = String(reason?.message || reason || '').toLowerCase();
  return msg.includes('websocket');
}

/** Evita ruído no console quando o WS fecha durante navegação ou StrictMode. */
export function installAppwriteRealtimeErrorGuard() {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => {
    if (isBenignAppwriteRealtimeError(event.reason)) {
      event.preventDefault();
    }
  };
  window.addEventListener('unhandledrejection', handler);
  return () => window.removeEventListener('unhandledrejection', handler);
}

/**
 * @param {{ subscribe: (channel: string, cb: (ev: unknown) => void) => Promise<{ close?: () => void }> }} realtimeClient
 * @param {string} channel
 * @param {(ev: unknown) => void} callback
 */
export async function subscribeAppwriteRealtime(realtimeClient, channel, callback) {
  if (!realtimeClient?.subscribe || !channel) return null;
  try {
    const { syncClientSessionJwt } = await import('./appwrite.js');
    await syncClientSessionJwt();
    return await realtimeClient.subscribe(channel, callback);
  } catch {
    return null;
  }
}

/** @param {{ close?: () => void | Promise<void> } | null | undefined} subscription */
export function closeAppwriteRealtimeSubscription(subscription) {
  if (!subscription?.close) return;
  try {
    const result = subscription.close();
    if (result && typeof result.catch === 'function') {
      void result.catch(() => {});
    }
  } catch {
    void 0;
  }
}
