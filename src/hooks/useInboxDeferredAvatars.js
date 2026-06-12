import { useCallback, useEffect, useRef } from 'react';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import {
  applyAvatarMap,
  applyAvatarToSelected,
  AVATAR_BATCH_GAP_MS,
  pickPhonesForAvatarFetch,
  selectedConversationNeedsAvatar,
} from '../lib/inboxDeferredAvatars.js';
import { getInboxJwt, safeParseInboxJson } from '../lib/inboxApiUtils.js';

function scheduleIdleWork(run, { timeout = 1800, fallbackMs = 400 } = {}) {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => run(), { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, fallbackMs);
  return () => window.clearTimeout(id);
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Busca fotos de perfil WhatsApp em lotes após a lista carregar — não bloqueia o bootstrap.
 * Prioriza a conversa selecionada e continua em fila até cobrir contatos visíveis sem foto.
 */
export function useInboxDeferredAvatars({
  academyId,
  items,
  loading,
  selectedPhone,
  setItems,
  setSelected,
}) {
  const attemptedRef = useRef(new Set());
  const inFlightRef = useRef(false);
  const itemsRef = useRef(items);
  const selectedPhoneRef = useRef(selectedPhone);
  const kickTimerRef = useRef(null);

  itemsRef.current = items;
  selectedPhoneRef.current = selectedPhone;

  useEffect(() => {
    attemptedRef.current = new Set();
  }, [academyId]);

  const runQueue = useCallback(async () => {
    if (inFlightRef.current) return;
    const aid = String(academyId || '').trim();
    if (!aid) return;

    inFlightRef.current = true;
    try {
      while (true) {
        const phones = pickPhonesForAvatarFetch(
          itemsRef.current,
          selectedPhoneRef.current,
          attemptedRef.current
        );
        if (!phones.length) break;

        try {
          const jwt = await getInboxJwt();
          const qs = new URLSearchParams();
          qs.set('avatars', '1');
          qs.set('phones', phones.join(','));
          const { blocked, res } = await fetchWithBillingGuard(`/api/conversations?${qs.toString()}`, {
            headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': aid },
          });

          if (blocked || !res?.ok) break;

          const raw = await res.text();
          const data = safeParseInboxJson(raw) || {};
          const avatars = data?.avatars && typeof data.avatars === 'object' ? data.avatars : {};

          for (const p of phones) attemptedRef.current.add(p);

          if (Object.keys(avatars).length) {
            setItems((prev) => applyAvatarMap(Array.isArray(prev) ? prev : [], avatars));
            if (typeof setSelected === 'function') {
              setSelected((prev) => applyAvatarToSelected(prev, avatars));
            }
          }
        } catch {
          break;
        }

        const remaining = pickPhonesForAvatarFetch(
          itemsRef.current,
          selectedPhoneRef.current,
          attemptedRef.current
        );
        if (!remaining.length) break;
        await sleep(AVATAR_BATCH_GAP_MS);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [academyId, setItems, setSelected]);

  const scheduleRun = useCallback(() => {
    if (kickTimerRef.current != null) {
      window.clearTimeout(kickTimerRef.current);
      kickTimerRef.current = null;
    }

    const eager = selectedConversationNeedsAvatar(itemsRef.current, selectedPhoneRef.current);
    const cancelIdle = scheduleIdleWork(
      () => {
        kickTimerRef.current = null;
        void runQueue();
      },
      eager ? { timeout: 80, fallbackMs: 0 } : undefined
    );

    kickTimerRef.current = cancelIdle;
  }, [runQueue]);

  useEffect(() => {
    const aid = String(academyId || '').trim();
    if (!aid || loading) return undefined;

    scheduleRun();
    return () => {
      if (kickTimerRef.current != null) {
        kickTimerRef.current();
        kickTimerRef.current = null;
      }
    };
  }, [academyId, loading, items, selectedPhone, scheduleRun]);
}
