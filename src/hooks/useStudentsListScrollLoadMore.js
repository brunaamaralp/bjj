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
 * Infinite scroll para a lista de alunos (padrão Inbox).
 */
export function useStudentsListScrollLoadMore({
  studentsHasMore,
  loadingMore,
  studentsLoading,
  onLoadMore,
}) {
  const loadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  const throttleRef = useRef({ lastRun: 0, timer: null });
  const onListScroll = useCallback(
    (e) => {
      runThrottled(throttleRef, 120, () => {
        if (!studentsHasMore || loadingMore || studentsLoading) return;
        const el = e?.currentTarget;
        if (!el) return;
        const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (remaining < 240) {
          void loadMoreRef.current?.();
        }
      });
    },
    [studentsHasMore, loadingMore, studentsLoading]
  );

  return { onListScroll };
}
