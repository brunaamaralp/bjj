import { useEffect } from 'react';

/**
 * Seleciona a primeira conversa visível quando não há ?phone= na URL (desktop bootstrap).
 */
export function useInboxAutoSelectConversation({
  academyId,
  loading,
  searchQuery,
  location,
  firstVisibleConversation,
  selectedPhoneRef,
  inboxAutoSelectDoneRef,
  handleSelectConversationRef,
  normalizePhone,
}) {
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (normalizePhone(String(params.get('phone') || '').trim())) return;
    if (searchQuery) return;
    const curAcademy = String(academyId || '').trim();
    if (!curAcademy) return;
    if (loading && !firstVisibleConversation) return;
    if (inboxAutoSelectDoneRef.current) return;
    if (String(selectedPhoneRef.current || '').trim()) return;
    const it = firstVisibleConversation;
    if (!it) return;
    inboxAutoSelectDoneRef.current = true;
    handleSelectConversationRef.current(it);
  }, [
    academyId,
    loading,
    firstVisibleConversation,
    location.search,
    searchQuery,
    inboxAutoSelectDoneRef,
    handleSelectConversationRef,
    normalizePhone,
    selectedPhoneRef,
  ]);
}
