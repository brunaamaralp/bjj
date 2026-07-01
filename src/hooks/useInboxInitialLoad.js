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
 * Reseta estado local da inbox ao trocar de academia.
 * A carga da lista fica em useInboxConversationList (useLayoutEffect).
 */
export function useInboxInitialLoad({
  academyId,
  setSelectedPhone,
  setSelected,
  setItems,
  setListCapped,
  setMsgFlags,
  setLoading,
  messageFlagsMigrationDoneRef,
  notifiedOnceRef,
  inboxAutoSelectDoneRef,
}) {
  const prevAcademyIdRef = useRef('');

  useEffect(() => {
    const cur = String(academyId || '').trim();
    if (!cur) return;

    const prevAcademy = prevAcademyIdRef.current;
    const academyChanged = prevAcademy && prevAcademy !== cur;

    if (academyChanged) {
      setSelectedPhone('');
      setSelected(null);
      setItems([]);
      setListCapped(false);
      setMsgFlags({});
      setLoading?.(true);
      messageFlagsMigrationDoneRef.current = false;
      notifiedOnceRef.current = false;
      inboxAutoSelectDoneRef.current = false;
    }

    prevAcademyIdRef.current = cur;
  }, [
    academyId,
    setSelectedPhone,
    setSelected,
    setItems,
    setListCapped,
    setMsgFlags,
    setLoading,
    messageFlagsMigrationDoneRef,
    notifiedOnceRef,
    inboxAutoSelectDoneRef,
  ]);
}
