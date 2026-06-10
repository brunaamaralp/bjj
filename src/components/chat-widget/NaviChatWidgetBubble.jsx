import React from 'react';
import { MessageCircle } from 'lucide-react';
import { inboxProfileImageUrl } from '../../lib/inboxContactDisplay.js';
import ContactAvatar from '../shared/ContactAvatar.jsx';

export default function NaviChatWidgetBubble({
  leadName = '',
  profileImageUrl = '',
  unreadCount = 0,
  onOpen,
  isMobile = false,
}) {
  const name = String(leadName || '').trim() || 'Conversa';
  const avatarUrl = inboxProfileImageUrl({ whatsapp_profile_image_url: profileImageUrl });
  const unread = Math.max(0, Math.floor(Number(unreadCount) || 0));
  const ariaLabel =
    unread > 0
      ? `Abrir conversa com ${name}, ${unread} mensagem(ns) não lida(s)`
      : `Abrir conversa com ${name}`;

  if (isMobile) {
    return (
      <button
        type="button"
        className="navi-chat-widget__fab"
        onClick={onOpen}
        aria-label={ariaLabel}
      >
        <MessageCircle size={24} strokeWidth={2} aria-hidden />
        {unread > 0 ? (
          <span className="navi-chat-widget__fab-badge" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="navi-chat-widget__pill"
      onClick={onOpen}
      aria-label={ariaLabel}
    >
      <span className="navi-chat-widget__pill-avatar" aria-hidden>
        <ContactAvatar contact={{ name, avatar_url: avatarUrl }} size={32} fill />
      </span>
      <span className="navi-chat-widget__pill-name">{name}</span>
      {unread > 0 ? (
        <span className="navi-chat-widget__pill-badge" aria-hidden>
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </button>
  );
}
