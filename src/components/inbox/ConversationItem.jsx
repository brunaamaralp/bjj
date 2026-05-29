import React, { useRef, useCallback, useState, useEffect } from 'react';
import { AlertTriangle, Flame, User } from 'lucide-react';
const LONG_PRESS_MS = 520;
const MOVE_CANCEL_PX = 12;

/** Apenas chips de ação (handoff / aguardando) — sem decoração na lista. */
function resolvePrimaryChip({ showHandoffChip, showL2WaitingChip, ticket }) {
  if (showHandoffChip) {
    return { kind: 'handoff', label: 'Com você', className: 'inbox-status-chip-handoff' };
  }
  if (showL2WaitingChip && ticket?.label) {
    return {
      kind: 'ticket',
      label: ticket.label,
      className: 'inbox-ticket-chip-inline',
      style: { background: ticket.bg, color: ticket.fg },
    };
  }
  return null;
}

function ConversationItem({
  item,
  active,
  onSelectConversation,
  ticketChip,
  formatTimeOnly,
  formatWhen,
  formatActivityLabel,
  compact = false,
  enableLongPress = false,
  onLongPress,
  handoffNowMs,
  listFilter = 'all',
  minhaFilaOn = false,
}) {
  const [rowHover, setRowHover] = useState(false);
  const hotLead = Boolean(item?._hotLead);
  const handoffActive = Boolean(item?._handoffActive);
  const aiSuggestHuman = Boolean(item?._aiSuggestHuman);
  const unreadCount = Number(item?._unreadCount || 0);
  const isHighlighted = Boolean(item?._isHighlighted);
  const ticket = ticketChip(item?._ticketStatus, item?._transferTo);
  const ticketStatusLower = String(item?._ticketStatus ?? item?.ticket_status ?? '')
    .trim()
    .toLowerCase();
  const isWaitingCustomer = ticketStatusLower === 'waiting_customer';

  const showHandoffChip = handoffActive;

  const rawPrev = String(item?.last_preview || '').replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  const preview = rawPrev.length > 52 ? `${rawPrev.slice(0, 52)}…` : rawPrev;

  const profileUrl = String(item?._profileImageUrl || item?.whatsapp_profile_image_url || '').trim();
  const [avatarOk, setAvatarOk] = useState(true);
  useEffect(() => {
    setAvatarOk(true);
  }, [profileUrl]);

  const showL2WaitingChip =
    !handoffActive && isWaitingCustomer && Boolean(ticket?.label) && !ticket?.isDefault;

  const showLevel3 = !enableLongPress && rowHover;
  const showL3Hot = showLevel3 && hotLead;
  const showL3AiAlert = showLevel3 && !handoffActive && aiSuggestHuman;
  const showL3Ticket =
    showLevel3 &&
    Boolean(ticket?.label) &&
    !ticket?.isDefault &&
    !(isWaitingCustomer && !handoffActive);

  const primaryChip = resolvePrimaryChip({
    showHandoffChip,
    showL2WaitingChip,
    ticket,
  });

  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);
  const touchStartRef = useRef(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    onSelectConversation?.(item);
  }, [onSelectConversation, item]);

  const handleTouchStart = useCallback(
    (e) => {
      if (!enableLongPress || !onLongPress) return;
      const t = e.touches?.[0];
      if (!t) return;
      longPressFiredRef.current = false;
      touchStartRef.current = { x: t.clientX, y: t.clientY };
      clearLongPressTimer();
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressFiredRef.current = true;
        try {
          onLongPress();
        } catch {
          void 0;
        }
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
        } catch {
          void 0;
        }
      }, LONG_PRESS_MS);
    },
    [enableLongPress, onLongPress, clearLongPressTimer]
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (!enableLongPress || !touchStartRef.current) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - touchStartRef.current.x);
      const dy = Math.abs(t.clientY - touchStartRef.current.y);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
        touchStartRef.current = null;
        clearLongPressTimer();
      }
    },
    [enableLongPress, clearLongPressTimer]
  );

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const itemClass = [
    'inbox-conversation-item',
    compact ? 'inbox-conversation-item--compact' : '',
    active ? 'active' : '',
    handoffActive && !active ? 'inbox-conversation-item--handoff' : '',
    isHighlighted && !active ? 'inbox-conversation-item--highlighted' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      data-inbox-conversation-item
      onClick={handleClick}
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => setRowHover(false)}
      onTouchStart={enableLongPress ? handleTouchStart : undefined}
      onTouchMove={enableLongPress ? handleTouchMove : undefined}
      onTouchEnd={enableLongPress ? handleTouchEnd : undefined}
      onTouchCancel={enableLongPress ? handleTouchEnd : undefined}
      className={itemClass}
    >
      <div className={`inbox-conversation-item__row${compact ? ' inbox-conversation-item__row--compact' : ''}`}>
        <div className={`inbox-conversation-item__main${compact ? ' inbox-conversation-item__main--compact' : ''}`}>
          <div
            className={`inbox-conversation-item__avatar${compact ? ' inbox-conversation-item__avatar--compact' : ''}`}
            aria-hidden
          >
            {profileUrl && avatarOk ? (
              <img
                src={profileUrl}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setAvatarOk(false)}
              />
            ) : (
              <User
                size={compact ? 16 : 18}
                strokeWidth={1.75}
                className="inbox-conversation-item__avatar-icon"
                aria-hidden
              />
            )}
          </div>
          <div className="inbox-conversation-item__content">
            <div className="inbox-conversation-item__title-row">
              <span
                className={`inbox-conversation-item__title${compact ? ' inbox-conversation-item__title--compact' : ''}`}
              >
                {String(item?._displayTitle || '-')}
              </span>
              {primaryChip ? (
                <span
                  className={`inbox-status-chip ${primaryChip.className}`}
                  title={primaryChip.title}
                  style={primaryChip.style}
                >
                  {primaryChip.label}
                </span>
              ) : null}
            </div>
            <div
              className={`inbox-conversation-item__preview-row${compact ? ' inbox-conversation-item__preview-row--compact' : ''}`}
            >
              <span
                className={`text-small inbox-conversation-item__preview${compact ? ' inbox-conversation-item__preview--compact' : ''}`}
              >
                {preview || '—'}
              </span>
            </div>
            {showL3Hot || showL3AiAlert || showL3Ticket ? (
              <div
                className={`inbox-conversation-item__l3${compact ? ' inbox-conversation-item__l3--compact' : ''}`}
              >
                {showL3Hot ? (
                  <span title="Lead quente" className="inbox-conversation-item__l3-icon inbox-conversation-item__l3-icon--hot">
                    <Flame size={compact ? 12 : 13} aria-hidden />
                  </span>
                ) : null}
                {showL3AiAlert ? (
                  <span title="IA sugere intervenção" className="inbox-conversation-item__l3-icon inbox-conversation-item__l3-icon--ai">
                    <AlertTriangle size={compact ? 12 : 13} aria-hidden />
                  </span>
                ) : null}
                {showL3Ticket ? (
                  <span className="text-small inbox-ticket-chip-inline" style={{ background: ticket.bg, color: ticket.fg }}>
                    {ticket.label}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className={`inbox-conversation-item__meta${compact ? ' inbox-conversation-item__meta--compact' : ''}`}>
          <span
            className={`text-small inbox-conversation-item__time${compact ? ' inbox-conversation-item__time--compact' : ''}`}
            title={formatWhen(item?.updated_at) || undefined}
          >
            {typeof formatActivityLabel === 'function'
              ? formatActivityLabel(item?.updated_at)
              : formatTimeOnly(item?.updated_at) || formatWhen(item?.updated_at)}
          </span>
          {unreadCount > 0 ? (
            <span className="text-small inbox-conversation-item__unread" title="Mensagens não lidas (unread_count)">
              {unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export default React.memo(ConversationItem);
