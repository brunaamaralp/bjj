import { useEffect, useRef, useState } from 'react';
import { realtime, DB_ID, CONVERSATIONS_COL } from '../lib/appwrite';

const REALTIME_DEBOUNCE_MS = 250;
const REALTIME_SUBSCRIBE_DELAY_MS = 300;

function isInboxDebugEnabled() {
  const envEnabled =
    import.meta.env.DEV ||
    ['1', 'true', 'yes'].includes(String(import.meta.env.VITE_INBOX_DEBUG || '').trim().toLowerCase());
  if (envEnabled) return true;
  if (typeof window === 'undefined') return false;
  try {
    const local = String(window.localStorage?.getItem('inbox_debug') || '').trim().toLowerCase();
    return local === '1' || local === 'true' || local === 'yes';
  } catch {
    return false;
  }
}

/**
 * Appwrite Realtime na coleção de conversas + poll de fallback com backoff em aba oculta.
 */
export function useInboxRealtimeSync({
  academyId,
  academyIdRef,
  selectedPhoneRef,
  loadListRef,
  loadThreadRef,
  realtimeTimersRef,
}) {
  const [realtimeOn, setRealtimeOn] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!String(academyId || '').trim()) return;

    const inboxDebugEnabled = isInboxDebugEnabled();
    const devLog = inboxDebugEnabled
      ? (...args) => {
          console.log(...args);
        }
      : () => {};

    if (!DB_ID || !CONVERSATIONS_COL) {
      if (inboxDebugEnabled) {
        console.warn('[Inbox Realtime] DB_ID ou CONVERSATIONS_COL vazio — subscription não criada');
      }
      return;
    }

    const channel = `databases.${DB_ID}.collections.${CONVERSATIONS_COL}.documents`;
    if (inboxDebugEnabled) {
      console.group('[Inbox Realtime] setup');
      devLog('DB_ID:', DB_ID);
      devLog('CONVERSATIONS_COL:', CONVERSATIONS_COL);
      devLog('academyId (ref):', academyIdRef.current || '(vazio)');
      devLog('academyId (prop):', academyId || '(vazio)');
      devLog('canal:', channel);
      console.groupEnd();
    }

    const cancelledRef = { current: false };
    let subscription = null;
    let subscribeTimer = null;

    const onRealtimeEvent = (ev) => {
      if (cancelledRef.current) return;
      const payload = ev && typeof ev === 'object' ? ev.payload : null;
      const academy =
        payload && typeof payload === 'object'
          ? String(payload.academy_id ?? payload.academyId ?? '').trim()
          : '';
      const expected = String(academyIdRef.current || '').trim();
      const phone =
        payload && typeof payload === 'object' ? String(payload.phone_number || '').trim() : '';
      const selectedNow = String(selectedPhoneRef.current || '').trim();

      if (inboxDebugEnabled) {
        console.group('[Inbox Realtime] evento');
        devLog('events:', ev?.events);
        devLog('phone:', phone || '(vazio)');
        devLog('academy payload:', academy || '(vazio)', '| esperado:', expected || '(vazio)');
        console.groupEnd();
      }

      if (academy && expected && academy !== expected) return;

      if (realtimeTimersRef.current?.list) clearTimeout(realtimeTimersRef.current.list);
      realtimeTimersRef.current.list = setTimeout(() => {
        const fn = loadListRef.current;
        if (typeof fn === 'function') void fn({ reset: true, silent: true });
      }, REALTIME_DEBOUNCE_MS);

      if (phone && selectedNow && phone === selectedNow) {
        if (realtimeTimersRef.current?.thread) clearTimeout(realtimeTimersRef.current.thread);
        realtimeTimersRef.current.thread = setTimeout(() => {
          const fn = loadThreadRef.current;
          if (typeof fn === 'function') void fn(phone, { silent: true });
        }, REALTIME_DEBOUNCE_MS);
      }
    };

    subscribeTimer = window.setTimeout(() => {
      if (cancelledRef.current) return;
      void realtime
        .subscribe(channel, onRealtimeEvent)
        .then((sub) => {
          if (cancelledRef.current) {
            void sub?.close?.();
            return;
          }
          subscription = sub;
          if (mountedRef.current) setRealtimeOn(true);
          if (inboxDebugEnabled) {
            devLog('[Inbox Realtime] subscrito; close:', typeof sub?.close);
          }
        })
        .catch((e) => {
          if (!cancelledRef.current && mountedRef.current) {
            console.error('[Inbox Realtime] falha ao subscrever:', e);
            setRealtimeOn(false);
          }
        });
    }, REALTIME_SUBSCRIBE_DELAY_MS);

    const timersRef = realtimeTimersRef;
    return () => {
      cancelledRef.current = true;
      if (subscribeTimer) clearTimeout(subscribeTimer);
      if (inboxDebugEnabled) {
        devLog('[Inbox Realtime] cleanup');
      }
      try {
        const timers = timersRef.current;
        if (timers?.list) clearTimeout(timers.list);
        if (timers?.thread) clearTimeout(timers.thread);
      } catch {
        void 0;
      }
      try {
        if (subscription && typeof subscription.close === 'function') void subscription.close();
      } catch {
        void 0;
      }
      if (mountedRef.current) setRealtimeOn(false);
    };
    // Refs são lidos em tempo de evento; reconecta só quando academyId muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- realtime subscription scoped to academyId
  }, [academyId]);

  return { realtimeOn };
}
