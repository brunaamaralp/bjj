import { useEffect } from 'react';

/**
 * Poll silencioso de lista e thread (sem refresh imediato no mount).
 */
export function useInboxAutoRefresh({
  autoRefresh,
  realtimeOn,
  loadListRef,
  loadThreadRef,
  selectedPhoneRef,
  draftRef,
  onListRefresh,
}) {
  useEffect(() => {
    if (!autoRefresh) return undefined;

    const INTERVAL_ACTIVE_LIST_MS = realtimeOn ? 30_000 : 20_000;
    const INTERVAL_ACTIVE_THREAD_MS = realtimeOn ? 15_000 : 30_000;
    const INTERVAL_INACTIVE_MS = 60_000;

    const runListRefresh = () => {
      const fn = loadListRef.current;
      if (typeof fn === 'function') fn({ reset: true, silent: true });
      if (typeof onListRefresh === 'function') onListRefresh();
    };

    const runThreadRefresh = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const phone = selectedPhoneRef.current;
      if (!phone || String(draftRef.current || '').trim()) return;
      const fnThread = loadThreadRef.current;
      if (typeof fnThread === 'function') fnThread(phone, { silent: true });
    };

    const runAutoRefresh = () => {
      runListRefresh();
      runThreadRefresh();
    };

    let listTimer = null;
    let threadTimer = null;

    const clearTimers = () => {
      if (listTimer) clearInterval(listTimer);
      if (threadTimer) clearInterval(threadTimer);
      listTimer = null;
      threadTimer = null;
    };

    const startTimers = () => {
      clearTimers();
      const hidden = typeof document !== 'undefined' && document.hidden;
      const listMs = hidden ? INTERVAL_INACTIVE_MS : INTERVAL_ACTIVE_LIST_MS;
      const threadMs = hidden ? INTERVAL_INACTIVE_MS : INTERVAL_ACTIVE_THREAD_MS;
      listTimer = setInterval(runListRefresh, listMs);
      threadTimer = setInterval(runThreadRefresh, threadMs);
    };

    const onVisibility = () => {
      if (!document.hidden) {
        runAutoRefresh();
      }
      startTimers();
    };

    startTimers();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [autoRefresh, realtimeOn, loadListRef, loadThreadRef, selectedPhoneRef, draftRef, onListRefresh]);
}
