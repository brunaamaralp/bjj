import React from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore';
import { useChatWidgetStore } from '../../store/useChatWidgetStore';

export default function NaviInboxShortcutFab({ onClick }) {
  const inboxUnread = useLeadStore((s) => s.inboxUnreadConversations);
  const shortcutLoading = useChatWidgetStore((s) => s.shortcutLoading);

  const unread = Math.max(0, Math.floor(Number(inboxUnread) || 0));
  const ariaLabel =
    unread > 0
      ? `Abrir conversas, ${unread} conversa(s) com mensagens não lidas`
      : 'Abrir conversas';

  return (
    <button
      type="button"
      className={`navi-chat-widget__fab navi-chat-widget__shortcut-fab${shortcutLoading ? ' navi-chat-widget__shortcut-fab--loading' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={shortcutLoading || undefined}
      disabled={shortcutLoading}
    >
      {shortcutLoading ? (
        <Loader2 size={24} strokeWidth={2} className="navi-chat-widget__spin" aria-hidden />
      ) : (
        <MessageCircle size={24} strokeWidth={2} aria-hidden />
      )}
      {!shortcutLoading && unread > 0 ? (
        <span className="navi-chat-widget__fab-badge" aria-hidden>
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </button>
  );
}
