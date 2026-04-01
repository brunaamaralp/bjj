import React from 'react';

export default function ConversationItem({
  item,
  active,
  onSelect,
  ticketChip,
  formatTimeOnly,
  formatWhen,
}) {
  const phone = String(item?._phone || item?.phone_number || '');
  const hotLead = Boolean(item?._hotLead);
  const handoffActive = Boolean(item?._handoffActive);
  const aiSuggestHuman = Boolean(item?._aiSuggestHuman);
  const unreadCount = Number(item?._unreadCount || 0);
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

  return (
    <button
      key={String(item?.id || phone)}
      onClick={onSelect}
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
        background: active ? 'rgba(0, 188, 142, 0.18)' : isHighlighted ? 'rgba(34, 197, 94, 0.10)' : 'transparent',
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
              {hotLead && <span title="Lead quente" style={{ fontSize: 12 }}>🔥</span>}
              {handoffActive && <span title="Atendimento assumido" style={{ fontSize: 12 }}>⏸️</span>}
              {!handoffActive && aiSuggestHuman && <span title="IA sugere intervenção" style={{ fontSize: 12 }}>⚠️</span>}
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
