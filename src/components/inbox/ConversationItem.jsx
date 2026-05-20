import React, { useRef, useCallback, useState, useEffect } from 'react';
import { AlertTriangle, Flame, User } from 'lucide-react';
import { useTerms } from '../../lib/terminology.js';

const LONG_PRESS_MS = 520;
const MOVE_CANCEL_PX = 12;

export default function ConversationItem({
  item,
  active,
  onSelect,
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
  const terms = useTerms();
  const [rowHover, setRowHover] = useState(false);
  const hotLead = Boolean(item?._hotLead);
  const handoffActive = Boolean(item?._handoffActive);
  const aiSuggestHuman = Boolean(item?._aiSuggestHuman);
  const unreadCount = Number(item?._unreadCount || 0);
  const contactType = String(item?._contactType || '').trim() === 'student' ? 'student' : 'lead';
  const lastRole = String(item?._lastRole || '').trim();
  const lastSender = String(item?._lastSender || '').trim();
  const isHighlighted = Boolean(item?._isHighlighted);
  const ticket = ticketChip(item?._ticketStatus, item?._transferTo);
  const ticketStatusLower = String(item?._ticketStatus ?? item?.ticket_status ?? '')
    .trim()
    .toLowerCase();
  const isWaitingCustomer = ticketStatusLower === 'waiting_customer';

  const showContactChip =
    listFilter === 'lead' ||
    listFilter === 'student' ||
    (listFilter === 'all' && !handoffActive && unreadCount <= 0);
  const showHandoffChip =
    handoffActive && (listFilter === 'need_human' || listFilter === 'needs_me' || minhaFilaOn);
  const showIaChip =
    !handoffActive &&
    unreadCount <= 0 &&
    lastRole === 'assistant' &&
    lastSender !== 'human' &&
    (listFilter === 'need_human' || listFilter === 'all');

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
    onSelect?.();
  }, [onSelect]);

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
      className={`inbox-conversation-item${active ? ' active' : ''}`}
      style={{
        display: 'block',
        boxSizing: 'border-box',
        width: '100%',
        textAlign: 'left',
        padding: compact ? '7px 10px 7px' : '10px 14px 10px',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        borderLeft: active
          ? '4px solid var(--accent)'
          : handoffActive
            ? '3px solid var(--warning)'
            : '4px solid transparent',
        background: active ? 'var(--v50)' : isHighlighted ? 'rgba(91, 63, 191, 0.08)' : 'transparent',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: compact ? 6 : 8,
          alignItems: 'flex-start',
          width: '100%',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', gap: compact ? 4 : 6, alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: compact ? 32 : 36,
              height: compact ? 32 : 36,
              borderRadius: 999,
              overflow: 'hidden',
              flexShrink: 0,
              background: 'var(--v50)',
              border: '0.5px solid var(--border-violet, var(--border))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 1,
            }}
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
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <User
                size={compact ? 16 : 18}
                strokeWidth={1.75}
                style={{ color: 'var(--text-muted)', opacity: 0.88 }}
                aria-hidden
              />
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: compact ? 'var(--inbox-font-list-title-sm)' : 'var(--inbox-font-list-title)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 80,
                }}
              >
                {String(item?._displayTitle || '-')}
              </span>
              {showContactChip ? (
                <span
                  className="text-small"
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: compact ? 'var(--inbox-font-caption)' : 'var(--inbox-font-secondary)',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {contactType === 'student' ? terms.student : 'Lead'}
                </span>
              ) : null}
              {showHandoffChip ? (
                <span className="inbox-status-chip inbox-status-chip-handoff" style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: '#FFF1EB', color: '#C2410C', flexShrink: 0 }}>
                  Com você
                </span>
              ) : null}
              {showIaChip ? (
                <span className="inbox-status-chip inbox-status-chip-ia" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--v50)', color: 'var(--v700)', flexShrink: 0 }}>
                  IA
                </span>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: compact ? 2 : 3, minWidth: 0 }}>
              <span
                className="text-small"
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: compact ? 'var(--inbox-font-caption)' : 'var(--inbox-font-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {preview || '—'}
              </span>
              {showL2WaitingChip ? (
                <span className="text-small" style={{ background: ticket.bg, color: ticket.fg, padding: '1px 6px', borderRadius: 999, flexShrink: 0 }}>
                  {ticket.label}
                </span>
              ) : null}
            </div>
            {showL3Hot || showL3AiAlert || showL3Ticket ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: compact ? 4 : 5 }}>
                {showL3Hot ? (
                  <span title="Lead quente" style={{ display: 'inline-flex', padding: '2px 6px', borderRadius: 999, background: 'rgba(245, 158, 11, 0.18)' }}>
                    <Flame size={compact ? 12 : 13} aria-hidden />
                  </span>
                ) : null}
                {showL3AiAlert ? (
                  <span title="IA sugere intervenção" style={{ display: 'inline-flex', padding: '2px 6px', borderRadius: 999, background: 'var(--warning-light)' }}>
                    <AlertTriangle size={compact ? 12 : 13} aria-hidden />
                  </span>
                ) : null}
                {showL3Ticket ? (
                  <span className="text-small" style={{ background: ticket.bg, color: ticket.fg, padding: '1px 6px', borderRadius: 999, flexShrink: 0 }}>
                    {ticket.label}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: compact ? 2 : 4, flexShrink: 0 }}>
          <span
            className="text-small"
            style={{
              color: 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: compact ? 'var(--inbox-font-caption)' : 'var(--inbox-font-secondary)',
              whiteSpace: 'nowrap',
            }}
            title={formatWhen(item?.updated_at) || undefined}
          >
            {typeof formatActivityLabel === 'function'
              ? formatActivityLabel(item?.updated_at)
              : formatTimeOnly(item?.updated_at) || formatWhen(item?.updated_at)}
          </span>
          {unreadCount > 0 ? (
            <span
              className="text-small"
              style={{ background: 'var(--danger)', color: '#fff', padding: '1px 7px', borderRadius: 999, fontWeight: 800 }}
              title="Mensagens não lidas (unread_count)"
            >
              {unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
