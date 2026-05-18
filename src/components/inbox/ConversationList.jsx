import React, { useMemo } from 'react';
import ConversationItem from './ConversationItem';
import EmptyState from '../shared/EmptyState.jsx';

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
  } = props;

  const groups = useMemo(() => safeGrouped(groupedItems).filter((g) => g.items.length > 0), [groupedItems]);
  const flatCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

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
      {groups.map((group) => (
        <div key={group.key}>
          <div className="inbox-group-title">{group.label}</div>
          {group.items.map((it, idx) => {
            const phone = String(it?._phone || it?.phone_number || '');
            return (
              <ConversationItem
                key={`${group.key}:${String(it?.id || phone || idx)}`}
                item={it}
                active={phone === selectedPhone}
                onSelect={() => onSelectConversation(it)}
                ticketChip={ticketChip}
                formatTimeOnly={formatTimeOnly}
                formatWhen={formatWhen}
                formatActivityLabel={formatActivityLabel}
                compact
                enableLongPress={Boolean(isMobile && typeof onConversationLongPress === 'function')}
                onLongPress={() => onConversationLongPress?.(it)}
                handoffNowMs={handoffNowMs}
              />
            );
          })}
        </div>
      ))}
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
