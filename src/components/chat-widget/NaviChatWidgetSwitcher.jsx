import React, { useCallback, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import ConversationItem from '../inbox/ConversationItem.jsx';
import {
  DropdownMenu,
  DropdownMenuPanel,
  DropdownMenuLabel,
  DropdownMenuItemStatic,
} from '../shared/menu';
import { useChatWidgetConversationPicker, pickerItemMatchesPhone } from '../../hooks/useChatWidgetConversationPicker.js';
import { primaryInboxPhone } from '../../lib/normalizeInboxPhone.js';
import ContactAvatar from '../shared/ContactAvatar.jsx';

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

export default function NaviChatWidgetSwitcher({
  academyId,
  activePhone,
  leadName,
  onSelect,
  panelOpen = false,
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const { items, loading, refresh } = useChatWidgetConversationPicker({
    academyId,
    enabled: panelOpen && open,
  });

  const handleSelect = useCallback(
    (listItem) => {
      const phone = primaryInboxPhone(listItem?.phone_number);
      if (!phone) return;
      onSelect?.({
        phone,
        leadId: String(listItem?.lead_id || '').trim(),
        leadName: String(listItem?.lead_name || listItem?.leadName || '').trim(),
      });
      setOpen(false);
    },
    [onSelect]
  );

  const displayName = String(leadName || '').trim() || 'Conversa';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} elevated className="navi-chat-widget__switcher">
      <button
        ref={triggerRef}
        type="button"
        className="navi-chat-widget__header-trigger"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="navi-chat-widget__header-avatar" aria-hidden>
          <ContactAvatar contact={{ name: displayName }} size={36} fill />
        </span>
        <span className="navi-chat-widget__header-text">
          <span className="navi-chat-widget__header-name">{displayName}</span>
          <span className="navi-chat-widget__header-sub">Trocar conversa</span>
        </span>
        <ChevronDown
          size={16}
          className={`navi-chat-widget__header-chevron${open ? ' is-open' : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <DropdownMenuPanel
          className="navi-chat-widget__switcher-panel"
          elevated
          aria-label="Trocar conversa"
          role="menu"
        >
          <DropdownMenuLabel>Conversas recentes</DropdownMenuLabel>
          {loading && items.length === 0 ? (
            <DropdownMenuItemStatic className="navi-chat-widget__switcher-loading">
              <Loader2 size={16} className="navi-chat-widget__spin" aria-hidden />
              Carregando…
            </DropdownMenuItemStatic>
          ) : null}
          {!loading && items.length === 0 ? (
            <DropdownMenuItemStatic>Nenhuma conversa encontrada.</DropdownMenuItemStatic>
          ) : null}
          <div className="navi-chat-widget__switcher-list">
            {items.map((item) => {
              const listItem = toConversationListItem(item);
              const active = pickerItemMatchesPhone(item, activePhone);
              return (
                <ConversationItem
                  key={item.phone}
                  item={listItem}
                  active={active}
                  compact
                  onSelectConversation={handleSelect}
                  formatTimeOnly={formatTimeOnly}
                  formatWhen={formatWhen}
                  formatActivityLabel={formatActivityLabel}
                />
              );
            })}
          </div>
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );
}
