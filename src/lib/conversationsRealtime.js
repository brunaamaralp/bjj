import { extractLastUserMessageAt } from './followupInbound.js';
import {
  closeAppwriteRealtimeSubscription,
  subscribeAppwriteRealtime,
} from './appwriteRealtime.js';

export const REALTIME_DEBOUNCE_MS = 250;
export const REALTIME_SUBSCRIBE_DELAY_MS = 300;

export function buildConversationsChannel(dbId, colId) {
  const db = String(dbId || '').trim();
  const col = String(colId || '').trim();
  if (!db || !col) return '';
  return `databases.${db}.collections.${col}.documents`;
}

export function readConversationAcademyId(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.academy_id ?? payload.academyId ?? '').trim();
}

export function readConversationPhone(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.phone_number ?? payload.phone ?? '').trim();
}

/** @param {unknown} payload @param {string} expectedAcademyId */
export function shouldProcessConversationEvent(payload, expectedAcademyId) {
  const academy = readConversationAcademyId(payload);
  const expected = String(expectedAcademyId || '').trim();
  if (academy && expected && academy !== expected) return false;
  return true;
}

/**
 * @param {unknown} payload
 * @returns {{ leadId: string; phone: string; lastUserMsgAt: string } | null}
 */
export function conversationEventToInboundPatch(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const lastUserMsgAt = extractLastUserMessageAt(payload);
  if (!lastUserMsgAt) return null;
  return {
    leadId: String(payload.lead_id ?? payload.leadId ?? '').trim(),
    phone: readConversationPhone(payload),
    lastUserMsgAt,
  };
}

/**
 * @param {{
 *   realtimeClient: { subscribe: (channel: string, cb: (ev: unknown) => void) => Promise<{ close?: () => void }> };
 *   channel: string;
 *   onEvent?: (ev: unknown) => void;
 *   onConnected?: () => void;
 *   onError?: (err: unknown) => void;
 *   subscribeDelayMs?: number;
 * }} opts
 */
export function subscribeConversationsRealtime({
  realtimeClient,
  channel,
  onEvent,
  onConnected,
  onError,
  subscribeDelayMs = REALTIME_SUBSCRIBE_DELAY_MS,
}) {
  if (!realtimeClient || !channel) {
    onError?.(new Error('realtime_not_configured'));
    return { close: () => {} };
  }

  let cancelled = false;
  /** @type {{ close?: () => void } | null} */
  let subscription = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let subscribeTimer = null;

  const handleEvent = (ev) => {
    if (cancelled) return;
    onEvent?.(ev);
  };

  subscribeTimer = setTimeout(() => {
    if (cancelled) return;
    void (async () => {
      try {
        const sub = await subscribeAppwriteRealtime(realtimeClient, channel, handleEvent);
        if (cancelled) {
          closeAppwriteRealtimeSubscription(sub);
          return;
        }
        if (!sub) {
          if (!cancelled) onError?.(new Error('realtime_subscribe_failed'));
          return;
        }
        subscription = sub;
        onConnected?.();
      } catch (err) {
        if (!cancelled) onError?.(err);
      }
    })();
  }, subscribeDelayMs);

  return {
    close() {
      cancelled = true;
      if (subscribeTimer) clearTimeout(subscribeTimer);
      closeAppwriteRealtimeSubscription(subscription);
      subscription = null;
    },
  };
}
