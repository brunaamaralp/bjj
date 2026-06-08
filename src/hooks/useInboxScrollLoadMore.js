import { useCallback, useRef } from 'react';

function throttle(fn, waitMs) {
  let lastRun = 0;
  let timer = null;
  return (...args) => {
    const now = Date.now();
    const remaining = waitMs - (now - lastRun);
    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastRun = now;
      fn(...args);
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      lastRun = Date.now();
      fn(...args);
    }, remaining);
  };
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
  loadListRef.current = loadList;

  const loadThreadRef = useRef(loadThread);
  loadThreadRef.current = loadThread;

  const onConversationListScroll = useCallback(
    throttle((e) => {
      if (searchQuery) return;
      const el = e?.currentTarget;
      if (!el) return;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining < 240) loadListRef.current({ reset: false, silent: true });
    }, 120),
    [searchQuery]
  );

  const onThreadScroll = useCallback(
    throttle((e) => {
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
    }, 120),
    [threadHasMore, threadPaging, threadCursor, newMsgCount, selectedPhoneRef, setThreadAtBottom, setNewMsgCount]
  );

  return { onConversationListScroll, onThreadScroll };
}
