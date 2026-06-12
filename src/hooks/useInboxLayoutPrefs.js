import { useEffect, useState } from 'react';

/**
 * Preferências de layout do Inbox persistidas em localStorage.
 */
export function useInboxLayoutPrefs() {
  const [listWidth, setListWidth] = useState(() => {
    if (typeof window === 'undefined') return 360;
    const raw = window.localStorage.getItem('inbox_list_width');
    const n = Number.parseInt(String(raw || ''), 10);
    if (!Number.isFinite(n)) return 360;
    return Math.max(300, Math.min(480, n));
  });

  const [contextOpen, setContextOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    const raw = window.localStorage.getItem('inbox_context_open');
    if (raw === '1') return true;
    if (raw === '0') return false;
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('inbox_list_width', String(listWidth));
  }, [listWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('inbox_context_open', contextOpen ? '1' : '0');
  }, [contextOpen]);

  return {
    listWidth,
    setListWidth,
    contextOpen,
    setContextOpen,
  };
}
