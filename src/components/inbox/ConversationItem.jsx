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
  const lastAssistantDot =
    lastRole === 'assistant'
      ? lastSender === 'human'
        ? { bg: '#f59e0b', label: 'Humano' }
        : { bg: '#22c55e', label: 'Agente IA' }
      : null;
  const isHighlighted = Boolean(item?._isHighlighted);
  const ticket = ticketChip(item?._ticketStatus, item?._transferTo);
  const ticketStatusLower = String(item?._ticketStatus ?? item?.ticket_status ?? '')
    .trim()
    .toLowerCase();
  const isWaitingCustomer = ticketStatusLower === 'waiting_customer';

  const rawPrev = String(item?.last_preview || '').replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  const previewMax = handoffActive ? 72 : 52;
  const preview = rawPrev.length > previewMax ? `${rawPrev.slice(0, previewMax)}…` : rawPrev;

  const profileUrl = String(item?._profileImageUrl || item?.whatsapp_profile_image_url || '').trim();
  const [avatarOk, setAvatarOk] = useState(true);
  useEffect(() => {
    setAvatarOk(true);
  }, [profileUrl]);

  const hasLevel1 = unreadCount > 0 || handoffActive;
  const showLevel2IA = !handoffActive && !hasLevel1;
  const pureAiLast = lastRole === 'assistant' && lastSender !== 'human';
  const showDot = Boolean(lastAssistantDot) && !(pureAiLast && showLevel2IA);

  const showL2WaitingChip =
    !hasLevel1 && isWaitingCustomer && Boolean(ticket?.label) && !ticket?.isDefault;

  const showLevel3 = !enableLongPress && rowHover;
  const showL3Hot = showLevel3 && hotLead;
  const showL3AiAlert = showLevel3 && !handoffActive && aiSuggestHuman;
  const showL3Ticket =
    showLevel3 &&
    Boolean(ticket?.label) &&
    !ticket?.isDefault &&
    !(isWaitingCustomer && !hasLevel1);

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
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: compact ? 6 : 8, alignItems: 'flex-start', width: '100%', minWidth: 0 }}>
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
              marginTop: 1
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
              <User size={compact ? 16 : 18} strokeWidth={1.75} style={{ color: 'var(--text-muted)', opacity: 0.88 }} aria-hidden />
            )}
          </div>
          {showDot ? (
            <span
              title={lastAssistantDot.label}
              style={{ width: 8, height: 8, borderRadius: 999, background: lastAssistantDot.bg, flex: '0 0 auto', marginTop: 4 }}
            />
          ) : null}
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
                  minWidth: 120
                }}
              >
                {String(item?._displayTitle || '-')}
              </span>
              <span
                className="text-small"
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: compact ? 'var(--inbox-font-caption)' : 'var(--inbox-font-secondary)',
                  padding: 0,
                  borderRadius: 0,
                  fontWeight: 600,
                  flexShrink: 0
                }}
              >
                {contactType === 'student' ? terms.student : 'Lead'}
              </span>
              {handoffActive ? (
                <span
                  title="Atendimento com você (handoff ativo)"
                  className="inbox-status-chip inbox-status-chip-handoff"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontSize: compact ? 'var(--inbox-font-meta)' : 'var(--inbox-font-caption)',
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 999,
                    background: 'var(--warning-light)',
                    color: 'var(--warning-text)',
                    flexShrink: 0,
                    lineHeight: 1.25
                  }}
                >
                  Com você
                </span>
              ) : null}
              {showLevel2IA ? (
                <span
                  title="A IA pode responder nesta conversa"
                  className="inbox-status-chip inbox-status-chip-ia"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontSize: compact ? 'var(--inbox-font-meta)' : 'var(--inbox-font-caption)',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: 'var(--inbox-info-badge-bg)',
                    color: 'var(--inbox-info-badge-fg)',
                    flexShrink: 0,
                    lineHeight: 1.25,
                    opacity: 0.92
                  }}
                >
                  IA
                </span>
              ) : null}
              {item?.lead_id && <span className="text-small" style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>●</span>}
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
                  flex: 1
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
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: compact ? 4 : 5,
                  minHeight: 0
                }}
              >
                {showL3Hot ? (
                  <span
                    title="Lead quente"
                    className="inbox-status-chip inbox-status-chip-hot"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: compact ? 'var(--inbox-font-meta)' : 'var(--inbox-font-caption)',
                      fontWeight: 800,
                      padding: compact ? '2px 5px' : '2px 6px',
                      borderRadius: 999,
                      background: 'rgba(245, 158, 11, 0.18)',
                      color: 'var(--warning-text)',
                      flexShrink: 0
                    }}
                  >
                    <Flame size={compact ? 12 : 13} aria-hidden />
                  </span>
                ) : null}
                {showL3AiAlert ? (
                  <span
                    title="IA sugere intervenção humana"
                    className="inbox-status-chip inbox-status-chip-warn"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: compact ? 'var(--inbox-font-meta)' : 'var(--inbox-font-caption)',
                      fontWeight: 800,
                      padding: compact ? '2px 5px' : '2px 6px',
                      borderRadius: 999,
                      background: 'var(--warning-light)',
                      color: 'var(--warning-text)',
                      flexShrink: 0
                    }}
                  >
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: compact ? 2 : 4, flexShrink: 0, marginLeft: compact ? 4 : 6 }}>
          <span
            className="text-small"
            style={{
              color: 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: compact ? 'var(--inbox-font-caption)' : 'var(--inbox-font-secondary)',
              whiteSpace: 'nowrap'
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
              title="Mensagens não lidas"
            >
              {unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
