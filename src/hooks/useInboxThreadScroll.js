import { useCallback, useEffect, useState } from 'react';

const EMPTY_SCROLL_STATE = { key: '', atBottom: true, newMsgCount: 0 };

/**
 * Rolagem do thread: auto-scroll ao abrir, contador de novas quando não está no fim.
 */
export function useInboxThreadScroll({
  selectedPhone,
  messageCount,
  threadScrollRef,
  selectedPhoneRef,
  threadMsgCountRef,
  lastAutoScrollPhoneRef,
  onPhoneChange,
}) {
  const phoneKey = String(selectedPhone || '').trim();
  const [scrollState, setScrollState] = useState(EMPTY_SCROLL_STATE);
  const activeState = scrollState.key === phoneKey ? scrollState : EMPTY_SCROLL_STATE;
  const threadAtBottom = activeState.atBottom;
  const newMsgCount = activeState.newMsgCount;

  const setThreadAtBottom = useCallback(
    (value) => {
      if (!phoneKey) return;
      setScrollState((prev) => ({
        key: phoneKey,
        atBottom: typeof value === 'function' ? value(prev.key === phoneKey ? prev.atBottom : true) : value,
        newMsgCount: prev.key === phoneKey ? prev.newMsgCount : 0,
      }));
    },
    [phoneKey]
  );

  const setNewMsgCount = useCallback(
    (value) => {
      if (!phoneKey) return;
      setScrollState((prev) => ({
        key: phoneKey,
        atBottom: prev.key === phoneKey ? prev.atBottom : true,
        newMsgCount: typeof value === 'function' ? value(prev.key === phoneKey ? prev.newMsgCount : 0) : value,
      }));
    },
    [phoneKey]
  );

  const scrollThreadToBottom = useCallback(({ clearNew = true } = {}) => {
    const el = threadScrollRef.current;
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
      lastAutoScrollPhoneRef.current = String(selectedPhoneRef.current || '').trim();
      if (!phoneKey) return;
      setScrollState({
        key: phoneKey,
        atBottom: true,
        newMsgCount: clearNew ? 0 : activeState.newMsgCount,
      });
    } catch {
      void 0;
    }
  }, [threadScrollRef, selectedPhoneRef, lastAutoScrollPhoneRef, phoneKey, activeState.newMsgCount]);

  useEffect(() => {
    if (!phoneKey) return undefined;
    threadMsgCountRef.current = Number(messageCount) || 0;
    const id = window.setTimeout(() => {
      onPhoneChange?.();
      scrollThreadToBottom({ clearNew: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [phoneKey, onPhoneChange, scrollThreadToBottom, messageCount, threadMsgCountRef]);

  useEffect(() => {
    if (!phoneKey) return undefined;
    const nextCount = Number(messageCount) || 0;
    const prevCount = Number(threadMsgCountRef.current || 0);
    threadMsgCountRef.current = nextCount;
    if (nextCount <= prevCount) return undefined;
    if (threadAtBottom) {
      const id = window.setTimeout(() => scrollThreadToBottom({ clearNew: true }), 0);
      return () => window.clearTimeout(id);
    }
    const delta = nextCount - prevCount;
    queueMicrotask(() => setNewMsgCount((value) => value + delta));
    return undefined;
  }, [messageCount, phoneKey, threadAtBottom, scrollThreadToBottom, setNewMsgCount, threadMsgCountRef]);

  return {
    threadAtBottom,
    setThreadAtBottom,
    newMsgCount,
    setNewMsgCount,
    scrollThreadToBottom,
  };
}
