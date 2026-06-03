import React, { useRef, useCallback, useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { INBOX_LIST_PREVIEW_MAX_COMPACT } from '../../lib/inboxUiConstants.js';
import StageBadge from '../shared/StageBadge.jsx';
import StatusBadge from '../shared/StatusBadge.jsx';
import { INBOX_TICKET_BADGE_MAP } from '../../lib/inboxTicketBadges.js';

const LONG_PRESS_MS = 520;
const MOVE_CANCEL_PX = 12;

/** Máximo 1 chip acionável por item na lista. */
function resolvePrimaryChip({ showHandoffChip, showWaitingChip, showIaChip, ticket }) {
  if (showHandoffChip) {
    return { kind: 'handoff', label: 'Com você', className: 'inbox-status-chip-handoff' };
  }
  if (showWaitingChip) {
    const label = String(ticket?.label || '').trim() || 'Aguardando cliente';
    const statusKey = String(ticket?.status || 'waiting_customer').trim();
    return {
      kind: 'waiting',
      label,
      status: statusKey,
      tone: ticket?.tone || 'warning',
    };
  }
  if (showIaChip) {
    return { kind: 'ia', label: 'IA respondendo', className: 'inbox-status-chip-ia' };
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
  agentIaActive = false,
}) {
  const needHuman = Boolean(item?.need_human ?? item?._handoffActive);
  const unreadCount = Number(item?._unreadCount || 0);
  const isHighlighted = Boolean(item?._isHighlighted);
  const ticket = ticketChip(item?._ticketStatus, item?._transferTo);
  const ticketStatusLower = String(item?._ticketStatus ?? item?.ticket_status ?? '')
    .trim()
    .toLowerCase();
  const isResolved = ticketStatusLower === 'resolved';
  const isWaitingCustomer = ticketStatusLower === 'waiting_customer';
  const lastRole = String(item?._lastRole || '').trim();
  const lastSender = String(item?._lastSender || '').trim();

  const showHandoffChip = needHuman && !isResolved;
  const showWaitingChip = !needHuman && isWaitingCustomer && !isResolved;
  const showIaChip =
    !needHuman &&
    !isResolved &&
    !isWaitingCustomer &&
    agentIaActive &&
    lastRole === 'assistant' &&
    lastSender !== 'human';

  const rawPrev = String(item?.last_preview || '').replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  const previewMax = compact ? INBOX_LIST_PREVIEW_MAX_COMPACT : 52;
  const preview = rawPrev.length > previewMax ? `${rawPrev.slice(0, previewMax)}…` : rawPrev;

  const profileUrl = String(item?._profileImageUrl || item?.whatsapp_profile_image_url || '').trim();
  const [avatarOk, setAvatarOk] = useState(true);
  useEffect(() => {
    setAvatarOk(true);
  }, [profileUrl]);

  const primaryChip = resolvePrimaryChip({
    showHandoffChip,
    showWaitingChip,
    showIaChip,
    ticket,
  });

  const pipelineStage = String(item?._pipelineStage || '').trim();

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
    needHuman && !active ? 'inbox-conversation-item--handoff' : '',
    isHighlighted && !active ? 'inbox-conversation-item--highlighted' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const listTitle = String(item?._displayTitle || '-').trim() || 'Conversa';
  const ariaLabelParts = [listTitle];
  if (unreadCount > 0) ariaLabelParts.push(`${unreadCount} não lidas`);
  if (primaryChip?.label) ariaLabelParts.push(primaryChip.label);

  return (
    <button
      type="button"
      data-inbox-conversation-item
      aria-label={ariaLabelParts.join(', ')}
      aria-current={active ? 'true' : undefined}
      onClick={handleClick}
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
              {pipelineStage ? (
                <StageBadge stage={pipelineStage} size="sm" className="inbox-conversation-item__stage" />
              ) : null}
              {primaryChip ? (
                primaryChip.kind === 'waiting' ? (
                  <StatusBadge
                    status={primaryChip.status}
                    map={{
                      ...INBOX_TICKET_BADGE_MAP,
                      [primaryChip.status]: {
                        label: primaryChip.label,
                        tone: primaryChip.tone,
                      },
                    }}
                    size="sm"
                    className="inbox-status-chip"
                  />
                ) : (
                  <span className={`inbox-status-chip ${primaryChip.className}`}>
                    {primaryChip.label}
                  </span>
                )
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
            <span className="text-small inbox-conversation-item__unread" title="Mensagens não lidas">
              {unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export default React.memo(ConversationItem);
