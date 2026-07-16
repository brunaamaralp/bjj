/**
 * Appwrite Realtime — subscribe seguro e supressão de rejeições benignas do SDK.
 */

/** @type {Map<string, { listeners: Set<(ev: unknown) => void>; subscription: { close?: () => void | Promise<void> } | null; connectPromise: Promise<{ close?: () => void | Promise<void> } | null> | null }>} */
const sharedChannelState = new Map();

/** Limpa estado compartilhado (testes). */
export function resetAppwriteRealtimeSharedState() {
  sharedChannelState.clear();
}

function dispatchSharedRealtimeEvent(channel, ev) {
  const entry = sharedChannelState.get(channel);
  if (!entry) return;
  for (const listener of entry.listeners) {
    try {
      listener(ev);
    } catch {
      void 0;
    }
  }
}

function teardownSharedChannel(channel) {
  const entry = sharedChannelState.get(channel);
  if (!entry) return;
  sharedChannelState.delete(channel);
  closeAppwriteRealtimeSubscription(entry.subscription);
  entry.subscription = null;
  entry.connectPromise = null;
}

/**
 * @param {{ subscribe: (channel: string, cb: (ev: unknown) => void) => Promise<{ close?: () => void | Promise<void> }> }} realtimeClient
 * @param {string} channel
 */
async function ensureSharedChannelSubscription(realtimeClient, channel) {
  let entry = sharedChannelState.get(channel);
  if (!entry) {
    entry = { listeners: new Set(), subscription: null, connectPromise: null };
    sharedChannelState.set(channel, entry);
  }

  if (entry.subscription) return entry.subscription;
  if (entry.connectPromise) return entry.connectPromise;

  entry.connectPromise = (async () => {
    try {
      const { syncClientSessionJwt } = await import('./appwrite.js');
      await syncClientSessionJwt();
      const sub = await realtimeClient.subscribe(channel, (ev) => {
        dispatchSharedRealtimeEvent(channel, ev);
      });
      const current = sharedChannelState.get(channel);
      if (!current || current.listeners.size === 0) {
        closeAppwriteRealtimeSubscription(sub);
        sharedChannelState.delete(channel);
        return null;
      }
      current.subscription = sub;
      current.connectPromise = null;
      return sub;
    } catch {
      const current = sharedChannelState.get(channel);
      if (current) {
        current.connectPromise = null;
        if (current.listeners.size === 0) sharedChannelState.delete(channel);
      }
      return null;
    }
  })();

  return entry.connectPromise;
}

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
  if (!realtimeClient?.subscribe || !channel || typeof callback !== 'function') return null;

  let entry = sharedChannelState.get(channel);
  if (!entry) {
    entry = { listeners: new Set(), subscription: null, connectPromise: null };
    sharedChannelState.set(channel, entry);
  }

  entry.listeners.add(callback);

  const unsubscribe = () => {
    const current = sharedChannelState.get(channel);
    if (!current) return;
    current.listeners.delete(callback);
    if (current.listeners.size === 0) teardownSharedChannel(channel);
  };

  try {
    await ensureSharedChannelSubscription(realtimeClient, channel);
  } catch {
    unsubscribe();
    return null;
  }

  const current = sharedChannelState.get(channel);
  if (!current?.listeners.has(callback)) {
    return { close: unsubscribe };
  }
  if (!current.subscription) {
    unsubscribe();
    return null;
  }

  return { close: unsubscribe };
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
