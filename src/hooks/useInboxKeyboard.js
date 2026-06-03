import { useEffect } from 'react';

/**
 * Atalhos globais da inbox (ignorados em inputs).
 */
export function useInboxKeyboard({
  flatVisibleConversations,
  selectedPhoneRef,
  selectedTicketStatus,
  handleSelectConversationRef,
  textareaRef,
  updateTicket,
  loadThread,
}) {
  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target;
      const tag = String(target?.tagName || '').toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      if (editing) return;

      const flat = flatVisibleConversations;
      const keyOne = e.key.length === 1 ? e.key.toLowerCase() : '';

      if (!e.ctrlKey && !e.metaKey && (keyOne === 'j' || keyOne === 'k') && flat.length) {
        e.preventDefault();
        const cur = String(selectedPhoneRef.current || '').trim();
        let idx = flat.findIndex((it) => String(it?._phone || it?.phone_number || '').trim() === cur);
        if (idx < 0) {
          const pick = keyOne === 'j' ? flat[0] : flat[flat.length - 1];
          if (pick) handleSelectConversationRef.current(pick);
          return;
        }
        const nextIdx = keyOne === 'j' ? Math.min(flat.length - 1, idx + 1) : Math.max(0, idx - 1);
        if (nextIdx !== idx) {
          const pick = flat[nextIdx];
          if (pick) handleSelectConversationRef.current(pick);
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey && keyOne === 'r' && selectedPhoneRef.current) {
        e.preventDefault();
        try {
          textareaRef.current?.focus?.();
        } catch {
          void 0;
        }
        return;
      }

      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        keyOne === 'e' &&
        selectedPhoneRef.current &&
        String(selectedTicketStatus || '').trim().toLowerCase() !== 'resolved'
      ) {
        e.preventDefault();
        void updateTicket({ status: 'resolved' });
        return;
      }

      if (!selectedPhoneRef.current) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        loadThread(selectedPhoneRef.current);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        void updateTicket({
          status: String(selectedTicketStatus || '') === 'resolved' ? 'open' : 'resolved',
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    flatVisibleConversations,
    selectedTicketStatus,
    selectedPhoneRef,
    handleSelectConversationRef,
    textareaRef,
    updateTicket,
    loadThread,
  ]);
}
