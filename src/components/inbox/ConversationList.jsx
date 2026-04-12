import React, { useEffect, useMemo } from 'react';
import ConversationItem from './ConversationItem';

function safeGrouped(groupedItems) {
  const arr = Array.isArray(groupedItems) ? groupedItems : [];
  return arr.map((g) => ({
    key: String(g?.key ?? ''),
    label: String(g?.label ?? ''),
    items: Array.isArray(g?.items) ? g.items : []
  }));
}

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
  const groups = useMemo(() => safeGrouped(groupedItems), [groupedItems]);
  const flatCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  useEffect(() => {
    const groupedItemKeys = groups.map((g) => g.key);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    console.log('[ConversationList] MONTADO', {
      groupedItemKeys,
      total,
      loading,
      totalItems
    });
  }, [groups, loading, totalItems]);

  const showSkeleton = Boolean(loading && groups.every((g) => g.items.length === 0));

  return (
    <div className="inbox-conversation-list-root" data-testid="inbox-conversation-list">
      {showSkeleton && (
        <div style={{ padding: 12 }}>
          {[0, 1, 2, 3, 4].map((idx) => (
            <div key={`skeleton-${idx}`} className="inbox-list-skeleton" />
          ))}
        </div>
      )}
      {groups.map((group) => (
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
    </div>
  );
}
