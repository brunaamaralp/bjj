import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ConversationItem from './ConversationItem';
import EmptyState from '../shared/EmptyState.jsx';
import {
  INBOX_LIST_DEFAULT_COLLAPSED_GROUPS,
  INBOX_LIST_SECTION_INITIAL,
  INBOX_LIST_SECTION_MORE_STEP,
} from '../../lib/inboxUiConstants.js';

/** Aceita array ou (defensivo) objeto tipo mapa id→linha — antes virava [] e sumiam todos os cards. */
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
    handoffNowMs,
    listFilter,
    minhaFilaOn,
  } = props;

  const groups = useMemo(() => safeGrouped(groupedItems).filter((g) => g.items.length > 0), [groupedItems]);
  const flatCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const [collapsedGroups, setCollapsedGroups] = useState(
    () => new Set(INBOX_LIST_DEFAULT_COLLAPSED_GROUPS)
  );
  const [visibleByGroup, setVisibleByGroup] = useState({});

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

  return (
    <div className="inbox-conversation-list-root" data-testid="inbox-conversation-list">
      {showSkeleton && (
        <div style={{ padding: 12 }}>
          {[0, 1, 2, 3, 4].map((idx) => (
            <div key={`skeleton-${idx}`} className="inbox-list-skeleton" />
          ))}
        </div>
      )}
      {groups.map((group) => {
        const collapsed = collapsedGroups.has(group.key);
        const visibleLimit = Number(visibleByGroup[group.key]) || INBOX_LIST_SECTION_INITIAL;
        const visibleItems = collapsed ? [] : group.items.slice(0, visibleLimit);
        const hiddenCount = collapsed ? group.items.length : Math.max(0, group.items.length - visibleItems.length);
        const canExpandSection = !collapsed && hiddenCount > 0;
        const isCollapsible = group.key === 'resolved' || group.items.length > INBOX_LIST_SECTION_INITIAL;
        const titleClass = `inbox-group-title${isCollapsible ? ' inbox-group-title--toggle' : ''}${collapsed ? ' inbox-group-title--collapsed' : ''}`;
        const titleInner = (
          <>
            <span className="inbox-group-title__label">
              {group.label}
              <span className="inbox-group-title__count">({group.items.length})</span>
            </span>
            {isCollapsible ? (
              collapsed ? (
                <ChevronRight size={14} aria-hidden className="inbox-group-title__chevron" />
              ) : (
                <ChevronDown size={14} aria-hidden className="inbox-group-title__chevron" />
              )
            ) : null}
          </>
        );

        return (
          <div key={group.key} className="inbox-conversation-group">
            {isCollapsible ? (
              <button
                type="button"
                className={titleClass}
                onClick={() => toggleGroupCollapsed(group.key)}
                aria-expanded={!collapsed}
              >
                {titleInner}
              </button>
            ) : (
              <div className={titleClass} role="presentation">
                {titleInner}
              </div>
            )}
            {visibleItems.map((it, idx) => {
              const phone = conversationPhone(it);
              return (
                <ConversationItem
                  key={`${group.key}:${String(it?.id || phone || idx)}`}
                  item={it}
                  active={phone === selectedPhone}
                  onSelectConversation={handleSelectConversation}
                  ticketChip={ticketChip}
                  formatTimeOnly={formatTimeOnly}
                  formatWhen={formatWhen}
                  formatActivityLabel={formatActivityLabel}
                  compact
                  enableLongPress={Boolean(isMobile && typeof onConversationLongPress === 'function')}
                  onLongPress={() => onConversationLongPress?.(it)}
                  handoffNowMs={handoffNowMs}
                  listFilter={listFilter}
                  minhaFilaOn={minhaFilaOn}
                />
              );
            })}
            {canExpandSection ? (
              <button
                type="button"
                className="inbox-list-section-more"
                onClick={() => showMoreInGroup(group.key, group.items.length)}
              >
                Ver mais {hiddenCount} conversa{hiddenCount === 1 ? '' : 's'}
              </button>
            ) : null}
            {collapsed && hiddenCount > 0 ? (
              <button
                type="button"
                className="inbox-list-section-more"
                onClick={() => toggleGroupCollapsed(group.key)}
              >
                Mostrar {hiddenCount} conversa{hiddenCount === 1 ? '' : 's'}
              </button>
            ) : null}
          </div>
        );
      })}
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
            title="Nenhuma conversa encontrada para esse filtro."
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
