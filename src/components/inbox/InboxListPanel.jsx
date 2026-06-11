import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, Filter, RefreshCw } from 'lucide-react';
import ConversationList from './ConversationList';
import SearchField from '../shared/SearchField.jsx';
import { DropdownMenu, DropdownMenuPanel } from '../shared/menu';
import { useAnchoredMenuPosition } from '../../hooks/useAnchoredMenuPosition.js';

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
  setListFilter,
  onConversationListScroll,
  groupedFilteredItems,
  loading,
  itemsLength,
  waChatConnected,
  loadingMore,
  handleSelectConversation,
  onPrefetchConversation,
  selectedPhone,
  ticketChip,
  formatTimeOnly,
  formatWhen,
  formatListActivityLabel,
  isMobile,
  handleClearInboxListFilters,
  setConversationSheet,
  agentIaActive = false,
  searchPending = false,
  activeFilterLabel = '',
  onClearActiveFilter,
  listTopbarMeta = null,
  pageActionsMenu = null,
  onSyncWhatsApp,
  waSyncing = false,
  desktopNotify = false,
  onToggleDesktopNotify,
}) {
  const unreadBacklog = Number(stats?.unreadBacklog || 0);
  const needsMeBacklog = Number(stats?.needsMeBacklog || 0);
  const listScrollRef = useRef(null);
  const moreBtnRef = useRef(null);
  const extraMenuStyle = useAnchoredMenuPosition(moreBtnRef, extraFiltersMenuOpen, {
    align: 'start',
    zIndex: 'var(--z-dropdown, 1200)',
  });

  const closeExtraMenu = () => setExtraFiltersMenuOpen(false);

  return (
    <div className="inbox-list-panel">
      <div className="inbox-list-panel__topbar">
        <div>
          <h2 className="inbox-list-panel__topbar-title">Conversas</h2>
          {listTopbarMeta ? (
            <div className="inbox-list-panel__topbar-meta" role="status">
              {listTopbarMeta}
            </div>
          ) : null}
        </div>
        <div className="inbox-list-panel__topbar-actions">
          {typeof onSyncWhatsApp === 'function' ? (
            <button
              type="button"
              className="inbox-list-panel__topbar-btn"
              aria-label={waSyncing ? 'Sincronizando WhatsApp' : 'Sincronizar WhatsApp'}
              title={waSyncing ? 'Sincronizando WhatsApp…' : 'Sincronizar WhatsApp'}
              disabled={waSyncing}
              onClick={() => void onSyncWhatsApp()}
            >
              <RefreshCw size={20} strokeWidth={2} aria-hidden className={waSyncing ? 'inbox-improve-spin' : undefined} />
            </button>
          ) : null}
          {typeof onToggleDesktopNotify === 'function' ? (
            <button
              type="button"
              className={`inbox-list-panel__topbar-btn${desktopNotify ? ' is-active' : ''}`}
              aria-label={desktopNotify ? 'Notificações ativas' : 'Ativar notificações'}
              title={desktopNotify ? 'Notificações ativas' : 'Ativar notificações'}
              aria-pressed={desktopNotify}
              onClick={() => void onToggleDesktopNotify()}
            >
              {desktopNotify ? (
                <Bell size={20} strokeWidth={2} aria-hidden />
              ) : (
                <BellOff size={20} strokeWidth={2} aria-hidden />
              )}
            </button>
          ) : null}
          {pageActionsMenu}
        </div>
      </div>
      <div className="navi-filters-stack inbox-list-panel__filters">
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
        <DropdownMenu
          open={extraFiltersMenuOpen}
          onOpenChange={setExtraFiltersMenuOpen}
          className="inbox-list-filters__extra inbox-list-filters-segments__more"
          elevated
          dismissExtraSelector="[data-inbox-extra-filters-menu]"
        >
          <button
            ref={moreBtnRef}
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
          {extraFiltersMenuOpen && extraMenuStyle
            ? createPortal(
                <DropdownMenuPanel
                  fixed
                  style={extraMenuStyle}
                  className="inbox-extra-filters-menu"
                  role="menu"
                  aria-label="Mais filtros"
                  data-inbox-extra-filters-menu
                >
                  <div className="inbox-list-filters__extra-menu-chips">
                    <button
                      type="button"
                      className={`filter-chip ${listFilter === 'need_human' ? 'is-active' : ''}`}
                      onClick={() => {
                        setListFilter('need_human');
                        closeExtraMenu();
                      }}
                    >
                      Só handoff
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${listFilter === 'waiting_customer' ? 'is-active' : ''}`}
                      onClick={() => {
                        setListFilter('waiting_customer');
                        closeExtraMenu();
                      }}
                    >
                      Aguardando cliente
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${listFilter === 'resolved' ? 'is-active' : ''}`}
                      onClick={() => {
                        setListFilter('resolved');
                        closeExtraMenu();
                      }}
                    >
                      Resolvidos
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${listFilter === 'archived' ? 'is-active' : ''}`}
                      onClick={() => {
                        setListFilter('archived');
                        closeExtraMenu();
                      }}
                    >
                      Arquivadas
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${listFilter === 'hot' ? 'is-active' : ''}`}
                      onClick={() => {
                        setListFilter('hot');
                        closeExtraMenu();
                      }}
                    >
                      Contato quente
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${listFilter === 'transferred' ? 'is-active' : ''}`}
                      onClick={() => {
                        setListFilter('transferred');
                        closeExtraMenu();
                      }}
                    >
                      Transferidas
                    </button>
                  </div>
                </DropdownMenuPanel>,
                document.body,
              )
            : null}
        </DropdownMenu>
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
          onPrefetchConversation={onPrefetchConversation}
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
