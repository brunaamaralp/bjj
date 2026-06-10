import { useEffect } from 'react';

/** Intervalos de polling — exportado para testes. */
export function getInboxAutoRefreshIntervals(realtimeOn, hidden = false) {
  if (hidden) {
    return {
      listMs: realtimeOn ? 120_000 : 60_000,
      threadMs: realtimeOn ? 120_000 : 60_000,
    };
  }
  if (realtimeOn) {
    return { listMs: 90_000, threadMs: 60_000 };
  }
  return { listMs: 20_000, threadMs: 30_000 };
}

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
      const { listMs, threadMs } = getInboxAutoRefreshIntervals(realtimeOn, hidden);
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
