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
 * Infinite scroll para a lista de alunos (padrão Inbox).
 */
export function useStudentsListScrollLoadMore({
  studentsHasMore,
  loadingMore,
  studentsLoading,
  onLoadMore,
}) {
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

  const onListScroll = useCallback(
    throttle((e) => {
      if (!studentsHasMore || loadingMore || studentsLoading) return;
      const el = e?.currentTarget;
      if (!el) return;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining < 240) {
        void loadMoreRef.current?.();
      }
    }, 120),
    [studentsHasMore, loadingMore, studentsLoading]
  );

  return { onListScroll };
}
