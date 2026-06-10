import { useCallback, useEffect, useRef } from 'react';

function runThrottled(ref, waitMs, fn) {
  const now = Date.now();
  const elapsed = now - ref.current.lastRun;
  if (elapsed >= waitMs) {
    if (ref.current.timer) {
      clearTimeout(ref.current.timer);
      ref.current.timer = null;
    }
    ref.current.lastRun = now;
    fn();
    return;
  }
  if (ref.current.timer) return;
  ref.current.timer = setTimeout(() => {
    ref.current.timer = null;
    ref.current.lastRun = Date.now();
    fn();
  }, waitMs - elapsed);
}

/**
 * Handlers de scroll com throttle para paginação de lista e thread.
 */
export function useInboxScrollLoadMore({
  searchQuery,
  loadList,
  loadThread,
  selectedPhoneRef,
  threadHasMore,
  threadPaging,
  threadCursor,
  setThreadAtBottom,
  setNewMsgCount,
  newMsgCount,
}) {
  const loadListRef = useRef(loadList);
  const loadThreadRef = useRef(loadThread);

  useEffect(() => {
    loadListRef.current = loadList;
  }, [loadList]);

  useEffect(() => {
    loadThreadRef.current = loadThread;
  }, [loadThread]);

  const listThrottleRef = useRef({ lastRun: 0, timer: null });
  const onConversationListScroll = useCallback(
    (e) => {
      runThrottled(listThrottleRef, 120, () => {
        if (searchQuery) return;
        const el = e?.currentTarget;
        if (!el) return;
        const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (remaining < 240) loadListRef.current({ reset: false, silent: true });
      });
    },
    [searchQuery]
  );

  const threadThrottleRef = useRef({ lastRun: 0, timer: null });
  const onThreadScroll = useCallback(
    (e) => {
      runThrottled(threadThrottleRef, 120, () => {
        const el = e && e.currentTarget ? e.currentTarget : null;
        if (!el) return;
        const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = remaining < 40;
        setThreadAtBottom(atBottom);
        if (atBottom && newMsgCount) setNewMsgCount(0);
        if (el.scrollTop < 140 && threadHasMore && !threadPaging && threadCursor) {
          loadThreadRef.current(selectedPhoneRef.current, {
            silent: true,
            cursor: String(threadCursor || ''),
            append: true,
          });
        }
      });
    },
    [threadHasMore, threadPaging, threadCursor, newMsgCount, selectedPhoneRef, setThreadAtBottom, setNewMsgCount]
  );

  return { onConversationListScroll, onThreadScroll };
}
