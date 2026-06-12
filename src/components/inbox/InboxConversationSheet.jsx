import React from 'react';

export default function InboxConversationSheet({
  conversationSheet,
  isMobile,
  sheetRef,
  onClose,
  markUnread,
  markSeen,
  archiveConversation,
}) {
  if (!conversationSheet || !isMobile) return null;

  const it = conversationSheet.item;
  const phone = String(it?._phone || it?.phone_number || '').trim();
  const title = String(it?._displayTitle || phone || 'Conversa');
  const sheetUnread = Number(it?._unreadCount ?? it?.unread_count ?? 0);

  if (!phone) return null;

  return (
    <div className="inbox-sheet-overlay" onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className="inbox-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-conversation-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inbox-sheet__handle" aria-hidden />
        <h2 id="inbox-conversation-sheet-title" className="inbox-sheet__title">
          {title}
        </h2>
        {sheetUnread === 0 ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', minHeight: 44 }}
            onClick={() => {
              void markUnread(phone);
            }}
          >
            Marcar como não lida
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', minHeight: 44 }}
            onClick={() => {
              void markSeen(phone, { notifySuccess: true });
              onClose();
            }}
          >
            Marcar como lida
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline"
          style={{ width: '100%', minHeight: 44, marginTop: 8 }}
          onClick={() => {
            void archiveConversation(phone);
            onClose();
          }}
        >
          Arquivar
        </button>
        <button
          type="button"
          className="btn btn-outline"
          style={{ width: '100%', minHeight: 44, marginTop: 8 }}
          onClick={onClose}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
