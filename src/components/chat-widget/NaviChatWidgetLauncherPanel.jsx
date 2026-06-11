import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import ConversationItem from '../inbox/ConversationItem.jsx';
import { useChatWidgetConversationPicker } from '../../hooks/useChatWidgetConversationPicker.js';
import { useChatWidgetStore } from '../../store/useChatWidgetStore';
import { primaryInboxPhone } from '../../lib/normalizeInboxPhone.js';

function formatTimeOnly(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatWhen(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nn = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((dd.getTime() - nn.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return formatTimeOnly(s);
  if (diff === -1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatActivityLabel() {
  return '';
}

function toConversationListItem(item) {
  const phone = primaryInboxPhone(item?.phone);
  return {
    phone_number: phone,
    lead_id: item?.leadId,
    lead_name: item?.leadName,
    last_preview: item?.lastPreview,
    last_message_timestamp: item?.timestamp,
    updated_at: item?.timestamp,
    whatsapp_profile_image_url: item?.profileImageUrl,
    need_human: false,
    _displayTitle: item?.leadName || phone,
    _unreadCount: item?.unreadCount,
    _handoffActive: false,
    _isHighlighted: false,
  };
}

export default function NaviChatWidgetLauncherPanel({ academyId, onClose }) {
  const navigate = useNavigate();
  const pinConversation = useChatWidgetStore((s) => s.pinConversation);
  const launcherOpen = useChatWidgetStore((s) => s.launcherOpen);

  const { items, loading, error } = useChatWidgetConversationPicker({
    academyId,
    enabled: launcherOpen,
  });

  const handleSelect = useCallback(
    (listItem) => {
      const phone = primaryInboxPhone(listItem?.phone_number);
      if (!phone) return;
      pinConversation({
        phone,
        leadId: String(listItem?.lead_id || '').trim(),
        leadName: String(listItem?.lead_name || listItem?.leadName || '').trim(),
        academyId,
        openPanel: true,
      });
    },
    [academyId, pinConversation]
  );

  const handleOpenInbox = useCallback(() => {
    onClose?.();
    navigate('/inbox');
  }, [navigate, onClose]);

  return (
    <div
      className="navi-chat-widget__launcher"
      role="dialog"
      aria-label="Selecionar conversa"
    >
      <header className="navi-chat-widget__launcher-header">
        <h2 className="navi-chat-widget__launcher-title">Conversas</h2>
        <button
          type="button"
          className="navi-chat-widget__icon-btn"
          title="Fechar"
          aria-label="Fechar seletor de conversas"
          onClick={onClose}
        >
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      </header>

      <div className="navi-chat-widget__launcher-body">
        {loading && items.length === 0 ? (
          <div className="navi-chat-widget__launcher-status" role="status">
            <Loader2 size={16} className="navi-chat-widget__spin" aria-hidden />
            Carregando…
          </div>
        ) : null}
        {error ? (
          <div className="navi-chat-widget__launcher-status navi-chat-widget__launcher-status--error" role="alert">
            {error}
          </div>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <div className="navi-chat-widget__launcher-status" role="status">
            Nenhuma conversa encontrada.
          </div>
        ) : null}
        <div className="navi-chat-widget__launcher-list">
          {items.map((item) => {
            const listItem = toConversationListItem(item);
            return (
              <ConversationItem
                key={item.phone}
                item={listItem}
                active={false}
                compact
                onSelectConversation={handleSelect}
                formatTimeOnly={formatTimeOnly}
                formatWhen={formatWhen}
                formatActivityLabel={formatActivityLabel}
              />
            );
          })}
        </div>
      </div>

      <footer className="navi-chat-widget__launcher-footer">
        <button type="button" className="btn btn-outline btn-sm" onClick={handleOpenInbox}>
          Ver todas no Inbox
        </button>
      </footer>
    </div>
  );
}
