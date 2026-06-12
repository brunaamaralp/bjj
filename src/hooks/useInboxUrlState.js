import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { inboxFilterFromUrlParam, inboxFilterToUrlParam } from '../lib/inboxUrlState.js';

const MINHA_FILA_STORAGE_KEY = 'nave_inbox_minha_fila';
const DEFAULT_INBOX_LIST_FILTER = 'all';

function readInitialInboxListFilter() {
  if (typeof window === 'undefined') return DEFAULT_INBOX_LIST_FILTER;
  try {
    const v = window.localStorage.getItem(MINHA_FILA_STORAGE_KEY);
    if (v === '1' || String(v).toLowerCase() === 'true') return 'needs_me';
  } catch {
    void 0;
  }
  return DEFAULT_INBOX_LIST_FILTER;
}

export function readInboxPhoneFromLocationSearch(search, normalizePhone) {
  if (typeof window === 'undefined') return '';
  const raw = new URLSearchParams(String(search || '')).get('phone') || '';
  return normalizePhone(raw);
}

/**
 * Sincroniza ?phone= e ?filter= com o estado do Inbox (bidirecional).
 */
export function useInboxUrlState({
  location,
  selectedPhone,
  setSelectedPhone,
  selectedPhoneRef,
  normalizePhone,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [listFilter, setListFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      const fromUrl = inboxFilterFromUrlParam(new URLSearchParams(window.location.search).get('filter'));
      if (fromUrl) return fromUrl;
    }
    return readInitialInboxListFilter();
  });
  const listFilterRef = useRef(listFilter);
  listFilterRef.current = listFilter;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const raw = String(params.get('phone') || '').trim();
    const digits = normalizePhone(raw);
    if (!digits) return;
    if (selectedPhoneRef.current === digits) return;
    setSelectedPhone(digits);
  }, [location.search, normalizePhone, selectedPhoneRef, setSelectedPhone]);

  useEffect(() => {
    const fromUrl = inboxFilterFromUrlParam(searchParams.get('filter'));
    if (fromUrl && fromUrl !== listFilterRef.current) {
      setListFilter(fromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const param = inboxFilterToUrlParam(listFilter);
        const cur = String(next.get('filter') || '').trim();
        if (param) {
          if (cur === param) return prev;
          next.set('filter', param);
        } else if (!cur) {
          return prev;
        } else {
          next.delete('filter');
        }
        return next;
      },
      { replace: true }
    );
  }, [listFilter, setSearchParams]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const phone = normalizePhone(selectedPhone);
        const cur = normalizePhone(next.get('phone') || '');
        if (phone) {
          if (cur === phone) return prev;
          next.set('phone', phone);
        } else if (!cur) {
          return prev;
        } else {
          next.delete('phone');
        }
        return next;
      },
      { replace: true }
    );
  }, [selectedPhone, setSearchParams, normalizePhone]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MINHA_FILA_STORAGE_KEY, listFilter === 'needs_me' ? '1' : '0');
    } catch {
      void 0;
    }
  }, [listFilter]);

  useEffect(() => {
    if (listFilter === 'my_queue') setListFilter('needs_me');
  }, [listFilter]);

  return { listFilter, setListFilter, listFilterRef };
}
