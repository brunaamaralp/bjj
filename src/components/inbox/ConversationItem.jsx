import React, { useRef, useCallback } from 'react';
import { AlertTriangle, Flame, PauseCircle } from 'lucide-react';

const LONG_PRESS_MS = 520;
const MOVE_CANCEL_PX = 12;

export default function ConversationItem({
  item,
  active,
  onSelect,
  ticketChip,
  formatTimeOnly,
  formatWhen,
  enableLongPress = false,
  onLongPress,
}) {
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
  const rawPrev = String(item?.last_preview || '').replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  const preview = rawPrev.length > 40 ? `${rawPrev.slice(0, 40)}…` : rawPrev;

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
        padding: '10px 14px 10px',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        borderLeft: active ? '4px solid var(--accent)' : '4px solid transparent',
        background: active ? 'var(--v50)' : isHighlighted ? 'rgba(91, 63, 191, 0.08)' : 'transparent',
        cursor: 'pointer',
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', width: '100%', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0, flex: 1 }}>
          {lastAssistantDot && (
            <span
              title={lastAssistantDot.label}
              style={{ width: 8, height: 8, borderRadius: 999, background: lastAssistantDot.bg, flex: '0 0 auto', marginTop: 2 }}
            />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {String(item?._displayTitle || '-')}
              </span>
              <span
                className="text-small"
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 10,
                  padding: 0,
                  borderRadius: 0,
                  fontWeight: 600,
                  flexShrink: 0
                }}
              >
                {contactType === 'student' ? 'Aluno' : 'Lead'}
              </span>
              {hotLead && (
                <span
                  title="Lead quente"
                  className="inbox-status-chip inbox-status-chip-hot"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 999,
                    background: 'rgba(245, 158, 11, 0.18)',
                    color: '#b45309',
                    flexShrink: 0
                  }}
                >
                  <Flame size={12} aria-hidden />
                  Quente
                </span>
              )}
              {handoffActive && (
                <span
                  title="Atendimento assumido"
                  className="inbox-status-chip inbox-status-chip-human"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 999,
                    background: 'var(--v50)',
                    color: 'var(--accent)',
                    flexShrink: 0
                  }}
                >
                  <PauseCircle size={12} aria-hidden />
                  Humano
                </span>
              )}
              {!handoffActive && aiSuggestHuman && (
                <span
                  title="IA sugere intervenção"
                  className="inbox-status-chip inbox-status-chip-warn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 999,
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: '#b45309',
                    flexShrink: 0
                  }}
                >
                  <AlertTriangle size={12} aria-hidden />
                  IA alerta
                </span>
              )}
              {item?.lead_id && <span className="text-small" style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>●</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, minWidth: 0 }}>
              <span
                className="text-small"
                style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
              >
                {preview || '—'}
              </span>
              {!!ticket?.label && !ticket?.isDefault && (
                <span className="text-small" style={{ background: ticket.bg, color: ticket.fg, padding: '1px 6px', borderRadius: 999, flexShrink: 0 }}>
                  {ticket.label}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 6 }}>
          <span className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {formatTimeOnly(item?.updated_at) || formatWhen(item?.updated_at)}
          </span>
          {unreadCount > 0 && (
            <span
              className="text-small"
              style={{ background: 'var(--danger)', color: '#fff', padding: '1px 7px', borderRadius: 999, fontWeight: 800 }}
              title="Mensagens não lidas"
            >
              {unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
