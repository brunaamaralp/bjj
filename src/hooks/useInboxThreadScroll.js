import { useCallback, useEffect, useState } from 'react';

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
  const [threadAtBottom, setThreadAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);

  const scrollThreadToBottom = useCallback(({ clearNew = true } = {}) => {
    const el = threadScrollRef.current;
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
      lastAutoScrollPhoneRef.current = String(selectedPhoneRef.current || '').trim();
      setThreadAtBottom(true);
      if (clearNew) setNewMsgCount(0);
    } catch {
      void 0;
    }
  }, [threadScrollRef, selectedPhoneRef, lastAutoScrollPhoneRef]);

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    if (!phone) return;
    threadMsgCountRef.current = Number(messageCount) || 0;
    onPhoneChange?.();
    setNewMsgCount(0);
    setThreadAtBottom(true);
    setTimeout(() => scrollThreadToBottom({ clearNew: true }), 0);
  }, [selectedPhone]);

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    if (!phone) return;
    const nextCount = Number(messageCount) || 0;
    const prevCount = Number(threadMsgCountRef.current || 0);
    threadMsgCountRef.current = nextCount;
    if (nextCount <= prevCount) return;
    if (threadAtBottom) {
      setTimeout(() => scrollThreadToBottom({ clearNew: true }), 0);
      return;
    }
    setNewMsgCount((v) => v + (nextCount - prevCount));
  }, [messageCount]);

  return {
    threadAtBottom,
    setThreadAtBottom,
    newMsgCount,
    setNewMsgCount,
    scrollThreadToBottom,
  };
}
