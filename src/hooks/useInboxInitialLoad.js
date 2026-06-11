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
  listFilter = 'all',
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
  const prevListFilterRef = useRef('');
  const mountedRef = useRef(false);

  useEffect(() => {
    const cur = String(academyId || '').trim();
    if (!cur) return;

    const prevAcademy = prevAcademyIdRef.current;
    const search = String(debouncedSearchQuery || '').trim();
    const prevSearch = prevSearchRef.current;
    const filter = String(listFilter || 'all').trim() || 'all';
    const prevFilter = prevListFilterRef.current;
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
    const filterChanged = mountedRef.current && prevAcademy === cur && filter !== prevFilter;
    const shouldLoad = !mountedRef.current || academyChanged || searchChanged || filterChanged;

    prevAcademyIdRef.current = cur;
    prevSearchRef.current = search;
    prevListFilterRef.current = filter;
    mountedRef.current = true;

    if (!shouldLoad) return;
    const fn = loadListRef.current;
    if (typeof fn === 'function') void fn({ reset: true });
  }, [
    academyId,
    debouncedSearchQuery,
    listFilter,
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
