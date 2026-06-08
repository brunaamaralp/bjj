import React from 'react';
import { MessageCircle } from 'lucide-react';

function displayInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  const one = parts[0] || '?';
  return one.slice(0, 2).toUpperCase();
}

export default function NaviChatWidgetBubble({
  leadName = '',
  profileImageUrl = '',
  unreadCount = 0,
  onOpen,
  isMobile = false,
}) {
  const name = String(leadName || '').trim() || 'Conversa';
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
        {profileImageUrl ? (
          <img src={profileImageUrl} alt="" width={32} height={32} loading="lazy" decoding="async" />
        ) : (
          displayInitials(name)
        )}
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
