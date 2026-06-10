import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ConversationItem from './ConversationItem';
import EmptyState from '../shared/EmptyState.jsx';
import { buildInboxListRows, estimateInboxListRowHeight } from '../../lib/inboxListRows.js';
import {
  INBOX_LIST_DEFAULT_COLLAPSED_GROUPS,
  INBOX_LIST_SECTION_INITIAL,
  INBOX_LIST_SECTION_MORE_STEP,
  INBOX_LIST_VIRTUALIZE_THRESHOLD,
} from '../../lib/inboxUiConstants.js';

function normalizeGroupItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null) return [];
  if (typeof raw === 'object') {
    if (typeof raw.length === 'number' && !Array.isArray(raw)) {
      try {
        return Array.from(raw);
      } catch {
        void 0;
      }
    }
    const vals = Object.values(raw);
    if (vals.length && vals.every((v) => v != null && typeof v === 'object')) return vals;
  }
  return [];
}

function safeGrouped(groupedItems) {
  const arr = Array.isArray(groupedItems) ? groupedItems : [];
  return arr.map((g) => ({
    key: String(g?.key ?? ''),
    label: String(g?.label ?? ''),
    items: normalizeGroupItems(g?.items),
  }));
}

function conversationPhone(it) {
  return String(it?._phone || it?.phone_number || '').trim();
}

function ListGroupHeader({ row, onToggle }) {
  const titleClass = `inbox-group-title inbox-group-title--virtual${
    row.collapsible ? ' inbox-group-title--toggle' : ''
  }${row.collapsed ? ' inbox-group-title--collapsed' : ''}`;
  const inner = (
    <>
      <span className="inbox-group-title__label">
        {row.label}
        <span className="inbox-group-title__count">({row.count})</span>
      </span>
      {row.collapsible ? (
        row.collapsed ? (
          <ChevronRight size={14} aria-hidden className="inbox-group-title__chevron" />
        ) : (
          <ChevronDown size={14} aria-hidden className="inbox-group-title__chevron" />
        )
      ) : null}
    </>
  );

  if (row.collapsible) {
    return (
      <button type="button" className={titleClass} onClick={() => onToggle(row.groupKey)} aria-expanded={!row.collapsed}>
        {inner}
      </button>
    );
  }
  return (
    <div className={titleClass} role="presentation">
      {inner}
    </div>
  );
}

export default function ConversationList(props) {
  const {
    groupedItems,
    loading,
    totalItems,
    whatsAppConnected = true,
    loadingMore,
    onSelectConversation,
    selectedPhone,
    ticketChip,
    formatTimeOnly,
    formatWhen,
    formatActivityLabel,
    isMobile = false,
    onConversationLongPress,
    onClearListFilters,
    agentIaActive = false,
    listScrollRef,
    searchQuery = '',
  } = props;

  const fallbackScrollRef = useRef(null);
  const scrollRef = listScrollRef || fallbackScrollRef;

  const groups = useMemo(() => safeGrouped(groupedItems).filter((g) => g.items.length > 0), [groupedItems]);
  const flatCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const [collapsedGroups, setCollapsedGroups] = useState(
    () => new Set(INBOX_LIST_DEFAULT_COLLAPSED_GROUPS)
  );
  const [visibleByGroup, setVisibleByGroup] = useState({});

  const rows = useMemo(
    () => buildInboxListRows(groups, collapsedGroups, visibleByGroup),
    [groups, collapsedGroups, visibleByGroup]
  );
  const shouldVirtualize = rows.length > INBOX_LIST_VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => rows[index]?.id ?? index,
    estimateSize: (index) => estimateInboxListRowHeight(rows[index]),
    overscan: 8,
  });

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    if (!phone) return;
    for (const g of groups) {
      if (g.items.some((it) => conversationPhone(it) === phone)) {
        setCollapsedGroups((prev) => {
          if (!prev.has(g.key)) return prev;
          const next = new Set(prev);
          next.delete(g.key);
          return next;
        });
        break;
      }
    }
  }, [selectedPhone, groups]);

  const handleSelectConversation = useCallback(
    (it) => onSelectConversation(it),
    [onSelectConversation]
  );

  const toggleGroupCollapsed = useCallback((groupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const showMoreInGroup = useCallback((groupKey, total) => {
    setVisibleByGroup((prev) => {
      const cur = Number(prev[groupKey]) || INBOX_LIST_SECTION_INITIAL;
      return { ...prev, [groupKey]: Math.min(total, cur + INBOX_LIST_SECTION_MORE_STEP) };
    });
  }, []);

  const showSkeleton = Boolean(loading && groups.every((g) => g.items.length === 0) && totalItems === 0);

  const renderRow = (row) => {
    if (row.type === 'header') {
      return <ListGroupHeader key={row.id} row={row} onToggle={toggleGroupCollapsed} />;
    }
    if (row.type === 'collapsed') {
      return (
        <button
          key={row.id}
          type="button"
          className="inbox-list-section-more"
          onClick={() => toggleGroupCollapsed(row.groupKey)}
        >
          Mostrar {row.hiddenCount} conversa{row.hiddenCount === 1 ? '' : 's'}
        </button>
      );
    }
    if (row.type === 'more') {
      const group = groups.find((g) => g.key === row.groupKey);
      return (
        <button
          key={row.id}
          type="button"
          className="inbox-list-section-more"
          onClick={() => showMoreInGroup(row.groupKey, group?.items?.length || 0)}
        >
          Ver mais {row.hiddenCount} conversa{row.hiddenCount === 1 ? '' : 's'}
        </button>
      );
    }
    if (row.type === 'item') {
      const it = row.item;
      const phone = conversationPhone(it);
      return (
        <ConversationItem
          key={row.id}
          item={it}
          active={phone === selectedPhone}
          onSelectConversation={handleSelectConversation}
          formatTimeOnly={formatTimeOnly}
          formatWhen={formatWhen}
          formatActivityLabel={formatActivityLabel}
          compact
          enableLongPress={Boolean(isMobile && typeof onConversationLongPress === 'function')}
          onLongPress={() => onConversationLongPress?.(it)}
        />
      );
    }
    return null;
  };

  return (
    <div className="inbox-conversation-list-root" data-testid="inbox-conversation-list">
      {showSkeleton && (
        <div style={{ padding: 12 }}>
          {[0, 1, 2, 3, 4].map((idx) => (
            <div key={`skeleton-${idx}`} className="inbox-list-skeleton" />
          ))}
        </div>
      )}
      {shouldVirtualize ? (
        <div className="inbox-conversation-list-virtual" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index];
            return (
              <div
                key={row.id}
                data-index={vRow.index}
                data-row-type={row.type}
                className="inbox-conversation-list-virtual__row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: estimateInboxListRowHeight(row),
                  transform: `translateY(${vRow.start}px)`,
                }}
              >
                {renderRow(row)}
              </div>
            );
          })}
        </div>
      ) : (
        rows.map((row) => renderRow(row))
      )}
      {!loading && totalItems === 0 && !whatsAppConnected && (
        <div style={{ padding: 12 }}>
          <EmptyState
            variant="default"
            tone="dashed"
            title="Conecte seu WhatsApp para receber e enviar mensagens diretamente pelo Nave."
            description="Configure a conexão na página do Agente IA."
            primaryAction={{
              label: 'Configurar WhatsApp',
              href: '/agente-ia',
            }}
            role="status"
          />
        </div>
      )}
      {!loading && totalItems === 0 && whatsAppConnected && (
        <div style={{ padding: 12 }}>
          <EmptyState
            variant="compact"
            tone="dashed"
            title="Nenhuma conversa ainda"
            description="Quando seus contatos enviarem mensagens, elas aparecerão aqui."
            role="status"
          />
        </div>
      )}
      {!loading && totalItems > 0 && flatCount === 0 && (
        <div style={{ padding: 12 }}>
          <EmptyState
            variant="compact"
            tone="dashed"
            title={
              searchQuery
                ? 'Nenhuma conversa encontrada para essa busca.'
                : 'Nenhuma conversa encontrada para esse filtro.'
            }
            secondaryAction={
              typeof onClearListFilters === 'function'
                ? { label: 'Limpar filtros', onClick: () => onClearListFilters(), variant: 'link' }
                : undefined
            }
            role="status"
          />
        </div>
      )}
      {loadingMore && <div style={{ padding: 12, color: 'var(--text-secondary)' }}>Carregando mais…</div>}
    </div>
  );
}
