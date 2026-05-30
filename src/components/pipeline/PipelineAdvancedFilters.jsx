import React from 'react';
import { LEAD_ORIGIN } from '../../store/useLeadStore';

/**
 * Painel de filtros avançados do funil (perfil, origem, período customizado, escopo de busca).
 */
export default function PipelineAdvancedFilters({
  profileFilter,
  setProfileFilter,
  originFilter,
  setOriginFilter,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  setQuickFilter,
  searchStageScope,
  setSearchStageScope,
  searchStageScopeOptions,
  onClear,
}) {
  const hasActive =
    profileFilter !== 'all' ||
    originFilter !== 'all' ||
    Boolean(filterDateFrom || filterDateTo) ||
    searchStageScope !== 'all';

  return (
    <div className="pipeline-filters-panel">
      <div className="pipeline-filters-panel__section">
        <span className="pipeline-filters-panel__label">Buscar em</span>
        <select
          className="form-input pipeline-filters-panel__select"
          value={searchStageScope}
          onChange={(e) => setSearchStageScope(e.target.value)}
          aria-label="Limitar busca a uma etapa"
        >
          {searchStageScopeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="pipeline-filters-panel__section">
        <span className="pipeline-filters-panel__label">Perfil</span>
        <select
          className="form-input pipeline-filters-panel__select"
          value={profileFilter}
          onChange={(e) => setProfileFilter(e.target.value)}
          aria-label="Filtrar por perfil"
        >
          <option value="all">Todos os perfis</option>
          <option value="Adulto">Adulto</option>
          <option value="Criança">Criança</option>
          <option value="Juniores">Juniores</option>
        </select>
      </div>

      <div className="pipeline-filters-panel__section">
        <span className="pipeline-filters-panel__label">Origem</span>
        <select
          className="form-input pipeline-filters-panel__select"
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value)}
          aria-label="Filtrar por origem"
        >
          <option value="all">Todas as origens</option>
          {LEAD_ORIGIN.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div className="pipeline-filters-panel__section">
        <span className="pipeline-filters-panel__label">Período customizado</span>
        <div className="pipeline-filters-panel__date-row">
          <input
            type="date"
            className="navi-date-filter pipeline-filters-panel__date"
            value={filterDateFrom}
            onChange={(e) => {
              setFilterDateFrom(e.target.value);
              setQuickFilter(null);
            }}
            aria-label="Data inicial"
          />
          <span className="pipeline-filters-panel__date-sep" aria-hidden>
            —
          </span>
          <input
            type="date"
            className="navi-date-filter pipeline-filters-panel__date"
            value={filterDateTo}
            onChange={(e) => {
              setFilterDateTo(e.target.value);
              setQuickFilter(null);
            }}
            aria-label="Data final"
          />
        </div>
      </div>

      {hasActive ? (
        <button type="button" className="pipeline-filters-panel__clear" onClick={onClear}>
          Limpar filtros avançados
        </button>
      ) : null}
    </div>
  );
}
