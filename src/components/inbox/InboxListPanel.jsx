import React from 'react';
import { Filter } from 'lucide-react';
import ConversationList from './ConversationList';
import FilterBar from '../shared/FilterBar.jsx';
import FormSelect from '../shared/FormSelect.jsx';

export default function InboxListPanel({
  searchQuery,
  hasMore,
  listFilter,
  minhaFilaOn,
  stats,
  extraFiltersMenuOpen,
  setExtraFiltersMenuOpen,
  inboxExtraFilterActive,
  listExtraFiltersRef,
  setMinhaFilaOn,
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

  return (
    <div className="inbox-list-panel">
      {!searchQuery ? (
        <div className="inbox-list-panel__scroll-hint">
          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
            {hasMore ? 'Role para carregar mais' : 'Fim'}
          </div>
        </div>
      ) : null}
      <FilterBar compact dense className="inbox-list-filters">
        <button
          type="button"
          className={`filter-chip ${!minhaFilaOn && listFilter === 'needs_me' ? 'is-active' : ''}`}
          onClick={() => {
            setMinhaFilaOn(false);
            setListFilter('needs_me');
          }}
          title="Handoff ativo com mensagens não lidas"
        >
          Precisa de mim
        </button>
        <button
          type="button"
          className={`filter-chip ${!minhaFilaOn && listFilter === 'unread' ? 'is-active' : ''}`}
          onClick={() => {
            setMinhaFilaOn(false);
            setListFilter('unread');
          }}
        >
          <span>Não lidas</span>
          {Number(stats?.unreadBacklog || 0) > 0 ? (
            <span
              className={`text-small inbox-unread-badge ${
                !minhaFilaOn && listFilter === 'unread'
                  ? 'inbox-unread-badge--active-chip'
                  : 'inbox-unread-badge--inactive'
              }`}
              title="Conversas com mensagens não lidas"
            >
              {Number(stats.unreadBacklog)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`filter-chip ${!minhaFilaOn && listFilter === 'need_human' ? 'is-active' : ''}`}
          onClick={() => {
            setMinhaFilaOn(false);
            setListFilter('need_human');
          }}
        >
          Com você agora
        </button>
        <button
          type="button"
          className={`filter-chip ${!minhaFilaOn && listFilter === 'waiting_customer' ? 'is-active' : ''}`}
          onClick={() => {
            setMinhaFilaOn(false);
            setListFilter('waiting_customer');
          }}
          title="Ticket aguardando resposta do cliente"
        >
          Aguardando cliente
        </button>
        <div ref={listExtraFiltersRef} className="inbox-list-filters__extra">
          <button
            type="button"
            className={`filter-chip ${extraFiltersMenuOpen || inboxExtraFilterActive ? 'is-active' : ''}`}
            onClick={() => setExtraFiltersMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={extraFiltersMenuOpen}
            title="Mais filtros"
          >
            <Filter size={16} strokeWidth={2} aria-hidden />
            Mais filtros
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
                  className={`filter-chip ${!minhaFilaOn && listFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMinhaFilaOn(false);
                    setListFilter('all');
                    setExtraFiltersMenuOpen(false);
                  }}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`filter-chip ${!minhaFilaOn && listFilter === 'resolved' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMinhaFilaOn(false);
                    setListFilter('resolved');
                    setExtraFiltersMenuOpen(false);
                  }}
                >
                  Resolvidos
                </button>
                <button
                  type="button"
                  className={`filter-chip ${!minhaFilaOn && listFilter === 'archived' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMinhaFilaOn(false);
                    setListFilter('archived');
                    setExtraFiltersMenuOpen(false);
                  }}
                >
                  Arquivadas
                </button>
                <button
                  type="button"
                  className={`filter-chip ${!minhaFilaOn && listFilter === 'hot' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMinhaFilaOn(false);
                    setListFilter('hot');
                    setExtraFiltersMenuOpen(false);
                  }}
                >
                  Contato quente
                </button>
                <button
                  type="button"
                  className={`filter-chip ${!minhaFilaOn && listFilter === 'transferred' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMinhaFilaOn(false);
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
      </FilterBar>
      <div className="inbox-list-panel__scroll" onScroll={onConversationListScroll}>
        <ConversationList
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
