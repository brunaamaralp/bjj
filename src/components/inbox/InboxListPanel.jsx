import React, { useRef } from 'react';
import { Filter } from 'lucide-react';
import ConversationList from './ConversationList';
import FormSelect from '../shared/FormSelect.jsx';

export default function InboxListPanel({
  searchQuery,
  hasMore,
  listFilter,
  stats,
  extraFiltersMenuOpen,
  setExtraFiltersMenuOpen,
  inboxExtraFilterActive,
  listExtraFiltersRef,
  setListFilter,
  inboxLabels,
  labelFilter,
  setLabelFilter,
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
}) {
  const labelOptions = (inboxLabels || []).map((l) => ({ value: l.$id, label: l.name }));
  const unreadBacklog = Number(stats?.unreadBacklog || 0);
  const listScrollRef = useRef(null);

  return (
    <div className="inbox-list-panel">
      {!searchQuery && hasMore ? (
        <div className="inbox-list-panel__scroll-hint" aria-hidden>
          <span className="text-small inbox-list-panel__scroll-hint-text">Role para carregar mais</span>
        </div>
      ) : null}
      <div className="inbox-list-filters-segments" role="tablist" aria-label="Filtro principal da lista">
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
          title="Handoff ativo com mensagens não lidas"
        >
          Precisa de mim
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={listFilter === 'unread'}
          className={`inbox-list-filters-segments__btn${listFilter === 'unread' ? ' is-active' : ''}`}
          onClick={() => setListFilter('unread')}
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
        <div ref={listExtraFiltersRef} className="inbox-list-filters__extra inbox-list-filters-segments__more">
          <button
            type="button"
            className={`inbox-list-filters-segments__btn inbox-list-filters-segments__btn--more${
              extraFiltersMenuOpen || inboxExtraFilterActive ? ' is-active' : ''
            }`}
            onClick={() => setExtraFiltersMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={extraFiltersMenuOpen}
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
                  Com você agora
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
              {inboxLabels.length > 0 ? (
                <div className="inbox-list-filters__label-section">
                  <label className="text-small inbox-list-filters__label-heading" htmlFor="inbox-label-filter">
                    Etiqueta
                  </label>
                  <FormSelect
                    id="inbox-label-filter"
                    value={labelFilter || ''}
                    onChange={(val) => setLabelFilter(val || null)}
                    density="toolbar"
                    emptyLabel="Todas as etiquetas"
                    options={labelOptions}
                    aria-label="Filtrar por etiqueta"
                    className={labelFilter ? 'inbox-label-filter--active' : ''}
                    style={{ width: '100%' }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
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
        />
      </div>
    </div>
  );
}
