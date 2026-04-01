import React from 'react';
import ConversationItem from './ConversationItem';

export default function ConversationList({
  groupedItems,
  loading,
  totalItems,
  loadingMore,
  onSelectConversation,
  selectedPhone,
  ticketChip,
  formatTimeOnly,
  formatWhen,
}) {
  return (
    <>
      {loading && groupedItems.every((g) => g.items.length === 0) && (
        <div style={{ padding: 12 }}>
          {[0, 1, 2, 3, 4].map((idx) => (
            <div key={`skeleton-${idx}`} className="inbox-list-skeleton" />
          ))}
        </div>
      )}
      {groupedItems.map((group) => (
        <div key={group.key}>
          <div className="inbox-group-title">{group.label}</div>
          {group.items.map((it) => {
            const phone = String(it?._phone || it?.phone_number || '');
            return (
              <ConversationItem
                key={String(it?.id || phone)}
                item={it}
                active={phone === selectedPhone}
                onSelect={() => onSelectConversation(it)}
                ticketChip={ticketChip}
                formatTimeOnly={formatTimeOnly}
                formatWhen={formatWhen}
              />
            );
          })}
        </div>
      ))}
      {!loading && totalItems === 0 && <div style={{ padding: 12, color: 'var(--text-secondary)' }}>Nenhuma conversa.</div>}
      {loadingMore && <div style={{ padding: 12, color: 'var(--text-secondary)' }}>Carregando mais…</div>}
    </>
  );
}
