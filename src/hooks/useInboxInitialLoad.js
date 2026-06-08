import { useEffect, useRef } from 'react';

const SERVER_FILTER_MAP = {
  needs_me: 'needs_me',
  need_human: 'needs_me',
  unread: 'unread',
  resolved: 'resolved',
  transferred: 'transferred',
};

export function inboxListFilterToServerParam(listFilter) {
  return SERVER_FILTER_MAP[String(listFilter || '').trim()] || '';
}

/**
 * Coordena carga inicial da lista: troca de academia e busca debounced.
 */
export function useInboxInitialLoad({
  academyId,
  debouncedSearchQuery,
  loadListRef,
  setSelectedPhone,
  setSelected,
  setItems,
  setListCapped,
  setMsgFlags,
  messageFlagsMigrationDoneRef,
  notifiedOnceRef,
  inboxAutoSelectDoneRef,
}) {
  const prevAcademyIdRef = useRef('');
  const prevSearchRef = useRef('');
  const mountedRef = useRef(false);

  useEffect(() => {
    const cur = String(academyId || '').trim();
    if (!cur) return;

    const prevAcademy = prevAcademyIdRef.current;
    const search = String(debouncedSearchQuery || '').trim();
    const prevSearch = prevSearchRef.current;
    const academyChanged = prevAcademy && prevAcademy !== cur;

    if (academyChanged) {
      setSelectedPhone('');
      setSelected(null);
      setItems([]);
      setListCapped(false);
      setMsgFlags({});
      messageFlagsMigrationDoneRef.current = false;
      notifiedOnceRef.current = false;
      inboxAutoSelectDoneRef.current = false;
    }

    const searchChanged = mountedRef.current && prevAcademy === cur && search !== prevSearch;
    const shouldLoad = !mountedRef.current || academyChanged || searchChanged;

    prevAcademyIdRef.current = cur;
    prevSearchRef.current = search;
    mountedRef.current = true;

    if (!shouldLoad) return;
    const fn = loadListRef.current;
    if (typeof fn === 'function') void fn({ reset: true });
  }, [
    academyId,
    debouncedSearchQuery,
    loadListRef,
    setSelectedPhone,
    setSelected,
    setItems,
    setListCapped,
    setMsgFlags,
    messageFlagsMigrationDoneRef,
    notifiedOnceRef,
    inboxAutoSelectDoneRef,
  ]);
}
