import { useCallback, useMemo } from 'react';

/**
 * Props dos menus da thread (ações da conversa + menu de mensagem).
 */
export function useInboxThreadMenuProps({
  selectedPhone,
  selected,
  items,
  listFilter,
  isMobile,
  isNarrowDesktop,
  contextOpen,
  setDetailsOpen,
  setContextOpen,
  updateTicket,
  ticketUpdating,
  archiveConversation,
  unarchiveConversation,
  markUnread,
  setDraft,
  textareaRef,
  copyToClipboard,
  toggleMsgFlag,
  setSelectedMsgKey,
  threadMessagesApiRef,
  selectedPhoneFlags,
  cancelScheduledMessage,
}) {
  const contextPanelVisible = contextOpen && !isNarrowDesktop;

  const scrollToMsgKey = useCallback((k) => {
    const key = String(k || '').trim();
    if (!key) return;
    try {
      threadMessagesApiRef.current?.scrollToMsgKey?.(key);
    } catch {
      void 0;
    }
  }, [threadMessagesApiRef]);

  const threadActionsMenuProps = useMemo(
    () => ({
      selectedPhone,
      selected,
      items,
      listFilter,
      isMobile,
      isNarrowDesktop,
      contextPanelVisible,
      setDetailsOpen,
      setContextOpen,
      updateTicket,
      ticketUpdating,
      archiveConversation,
      unarchiveConversation,
      markUnread,
    }),
    [
      selectedPhone,
      selected,
      items,
      listFilter,
      isMobile,
      isNarrowDesktop,
      contextPanelVisible,
      setDetailsOpen,
      setContextOpen,
      updateTicket,
      ticketUpdating,
      archiveConversation,
      unarchiveConversation,
      markUnread,
    ]
  );

  const messageMenuProps = useMemo(
    () => ({
      setDraft,
      textareaRef,
      copyToClipboard,
      toggleMsgFlag,
      setSelectedMsgKey,
      scrollToMsgKey,
      selectedPhoneFlags,
      cancelScheduledMessage,
    }),
    [
      setDraft,
      textareaRef,
      copyToClipboard,
      toggleMsgFlag,
      setSelectedMsgKey,
      scrollToMsgKey,
      selectedPhoneFlags,
      cancelScheduledMessage,
    ]
  );

  return { threadActionsMenuProps, messageMenuProps, scrollToMsgKey, contextPanelVisible };
}
