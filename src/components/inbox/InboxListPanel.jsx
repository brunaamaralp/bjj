import React, { useRef } from 'react';
import { Filter } from 'lucide-react';
import ConversationList from './ConversationList';
import SearchField from '../shared/SearchField.jsx';

export default function InboxListPanel({
  search = '',
  onSearchChange,
  searchQuery,
  hasMore,
  listFilter,
  stats,
  extraFiltersMenuOpen,
  setExtraFiltersMenuOpen,
  inboxExtraFilterActive,
  listExtraFiltersRef,
  setListFilter,
  onConversationListScroll,
  groupedFilteredItems,
  loading,
  itemsLength,
  waChatConnected,
  loadingMore,
  handleSelectConversation,
  selectedPhone,
  ticketChip,
  formatTimeOnly,
  formatWhen,
  formatListActivityLabel,
  isMobile,
  handleClearInboxListFilters,
  setConversationSheet,
  nowMs,
  agentIaActive = false,
  searchPending = false,
  activeFilterLabel = '',
  onClearActiveFilter,
}) {
  const unreadBacklog = Number(stats?.unreadBacklog || 0);
  const needsMeBacklog = Number(stats?.needsMeBacklog || 0);
  const listScrollRef = useRef(null);

  return (
    <div className="inbox-list-panel">
      <div className="inbox-list-panel__search">
        <SearchField
          className="inbox-toolbar-search inbox-list-panel__search-field"
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder="Buscar por telefone ou nome…"
          aria-label="Buscar conversas"
          aria-busy={searchPending || undefined}
          title="Atalhos: J/K conversas, R responder, E resolver"
        />
      </div>
      {searchPending ? (
        <div className="inbox-list-panel__scroll-hint" role="status">
          <span className="text-small inbox-list-panel__scroll-hint-text">Buscando…</span>
        </div>
      ) : null}
      <div className="inbox-list-filters-segments">
        <div className="inbox-list-filters-segments__tabs" role="tablist" aria-label="Filtro principal da lista">
          <button
            type="button"
            role="tab"
            aria-selected={listFilter === 'all'}
            className={`inbox-list-filters-segments__btn${listFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setListFilter('all')}
          >
            Todas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listFilter === 'needs_me'}
            className={`inbox-list-filters-segments__btn${listFilter === 'needs_me' ? ' is-active' : ''}`}
            onClick={() => setListFilter('needs_me')}
            title="Conversas em que você assumiu o atendimento (handoff ativo)"
          >
            <span>Com você</span>
            {needsMeBacklog > 0 ? (
              <span
                className={`text-small inbox-unread-badge ${
                  listFilter === 'needs_me' ? 'inbox-unread-badge--active-chip' : 'inbox-unread-badge--inactive'
                }`}
              >
                {needsMeBacklog}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listFilter === 'unread'}
            className={`inbox-list-filters-segments__btn${listFilter === 'unread' ? ' is-active' : ''}`}
            onClick={() => setListFilter('unread')}
            title="Conversas com mensagens não lidas"
          >
            <span>Não lidas</span>
            {unreadBacklog > 0 ? (
              <span
                className={`text-small inbox-unread-badge ${
                  listFilter === 'unread' ? 'inbox-unread-badge--active-chip' : 'inbox-unread-badge--inactive'
                }`}
              >
                {unreadBacklog}
              </span>
            ) : null}
          </button>
        </div>
        <div ref={listExtraFiltersRef} className="inbox-list-filters__extra inbox-list-filters-segments__more">
          <button
            type="button"
            className={`inbox-list-filters-segments__btn inbox-list-filters-segments__btn--more${
              extraFiltersMenuOpen || inboxExtraFilterActive ? ' is-active' : ''
            }`}
            onClick={() => setExtraFiltersMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={extraFiltersMenuOpen}
            aria-label="Mais filtros"
            title="Mais filtros"
          >
            <Filter size={14} strokeWidth={2} aria-hidden />
            Mais
          </button>
          {extraFiltersMenuOpen ? (
            <div
              role="menu"
              className="navi-menu__panel inbox-extra-filters-menu"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="inbox-list-filters__extra-menu-chips">
                <button
                  type="button"
                  className={`filter-chip ${listFilter === 'need_human' ? 'is-active' : ''}`}
                  onClick={() => {
                    setListFilter('need_human');
                    setExtraFiltersMenuOpen(false);
                  }}
                >
                  Só handoff
                </button>
                <button
                  type="button"
                  className={`filter-chip ${listFilter === 'waiting_customer' ? 'is-active' : ''}`}
                  onClick={() => {
                    setListFilter('waiting_customer');
                    setExtraFiltersMenuOpen(false);
                  }}
                >
                  Aguardando cliente
                </button>
                <button
                  type="button"
                  className={`filter-chip ${listFilter === 'resolved' ? 'is-active' : ''}`}
                  onClick={() => {
                    setListFilter('resolved');
                    setExtraFiltersMenuOpen(false);
                  }}
                >
                  Resolvidos
                </button>
                <button
                  type="button"
                  className={`filter-chip ${listFilter === 'archived' ? 'is-active' : ''}`}
                  onClick={() => {
                    setListFilter('archived');
                    setExtraFiltersMenuOpen(false);
                  }}
                >
                  Arquivadas
                </button>
                <button
                  type="button"
                  className={`filter-chip ${listFilter === 'hot' ? 'is-active' : ''}`}
                  onClick={() => {
                    setListFilter('hot');
                    setExtraFiltersMenuOpen(false);
                  }}
                >
                  Contato quente
                </button>
                <button
                  type="button"
                  className={`filter-chip ${listFilter === 'transferred' ? 'is-active' : ''}`}
                  onClick={() => {
                    setListFilter('transferred');
                    setExtraFiltersMenuOpen(false);
                  }}
                >
                  Transferidas
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {activeFilterLabel ? (
        <div className="inbox-list-filters-active" role="status">
          <span className="inbox-list-filters-active__label">
            Filtro: <strong>{activeFilterLabel}</strong>
          </span>
          <button
            type="button"
            className="inbox-list-filters-active__clear"
            onClick={() => onClearActiveFilter?.()}
          >
            Limpar filtro
          </button>
        </div>
      ) : null}
      <div ref={listScrollRef} className="inbox-list-panel__scroll" onScroll={onConversationListScroll}>
        <ConversationList
          listScrollRef={listScrollRef}
          groupedItems={groupedFilteredItems}
          loading={loading}
          totalItems={itemsLength}
          whatsAppConnected={waChatConnected}
          loadingMore={loadingMore}
          onSelectConversation={handleSelectConversation}
          selectedPhone={selectedPhone}
          ticketChip={ticketChip}
          formatTimeOnly={formatTimeOnly}
          formatWhen={formatWhen}
          formatActivityLabel={formatListActivityLabel}
          isMobile={isMobile}
          onClearListFilters={handleClearInboxListFilters}
          onConversationLongPress={(it) => {
            if (!isMobile) return;
            setConversationSheet({ item: it });
          }}
          handoffNowMs={nowMs}
          agentIaActive={agentIaActive}
          searchQuery={searchQuery}
        />
        {!searchPending && !searchQuery && hasMore ? (
          <div className="inbox-list-panel__scroll-hint inbox-list-panel__scroll-hint--footer" role="status">
            <span className="text-small inbox-list-panel__scroll-hint-text">Role para carregar mais</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
