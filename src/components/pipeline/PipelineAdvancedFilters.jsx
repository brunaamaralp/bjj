import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { LEAD_ORIGIN } from '../../store/useLeadStore';
import { DateInputField } from '../DateInput';

const EMPTY_DRAFT = {
  profileFilter: 'all',
  originFilter: 'all',
  filterDateFrom: '',
  filterDateTo: '',
  searchStageScope: 'all',
};

function draftFromApplied(applied) {
  return {
    profileFilter: applied.profileFilter ?? 'all',
    originFilter: applied.originFilter ?? 'all',
    filterDateFrom: applied.filterDateFrom ?? '',
    filterDateTo: applied.filterDateTo ?? '',
    searchStageScope: applied.searchStageScope ?? 'all',
  };
}

function draftIsActive(draft) {
  return (
    draft.profileFilter !== 'all' ||
    draft.originFilter !== 'all' ||
    Boolean(draft.filterDateFrom || draft.filterDateTo) ||
    draft.searchStageScope !== 'all'
  );
}

/**
 * Painel de filtros avançados do funil (perfil, origem, período, etapa).
 * Alterações ficam em rascunho até o usuário clicar em Buscar.
 */
export default function PipelineAdvancedFilters({
  open,
  profileFilter,
  originFilter,
  filterDateFrom,
  filterDateTo,
  searchStageScope,
  searchStageScopeOptions,
  onApply,
  onClear,
}) {
  const [draft, setDraft] = useState(() =>
    draftFromApplied({ profileFilter, originFilter, filterDateFrom, filterDateTo, searchStageScope })
  );

  useEffect(() => {
    if (open) {
      setDraft(
        draftFromApplied({ profileFilter, originFilter, filterDateFrom, filterDateTo, searchStageScope })
      );
    }
  }, [open, profileFilter, originFilter, filterDateFrom, filterDateTo, searchStageScope]);

  const hasDraftActive = useMemo(() => draftIsActive(draft), [draft]);

  const patchDraft = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  const handleApply = () => {
    onApply?.({ ...draft });
  };

  const handleClear = () => {
    setDraft({ ...EMPTY_DRAFT });
    onClear?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
  };

  return (
    <div className="pipeline-filters-panel" onKeyDown={handleKeyDown}>
      <div className="pipeline-filters-panel__section">
        <span className="pipeline-filters-panel__label">Etapa</span>
        <select
          className="form-input pipeline-filters-panel__select"
          value={draft.searchStageScope}
          onChange={(e) => patchDraft({ searchStageScope: e.target.value })}
          aria-label="Limitar resultados a uma etapa"
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
          value={draft.profileFilter}
          onChange={(e) => patchDraft({ profileFilter: e.target.value })}
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
          value={draft.originFilter}
          onChange={(e) => patchDraft({ originFilter: e.target.value })}
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
          <DateInputField
            type="date"
            className="navi-date-filter pipeline-filters-panel__date"
            value={draft.filterDateFrom}
            onChange={(e) => patchDraft({ filterDateFrom: e.target.value })}
            aria-label="Data inicial"
          />
          <span className="pipeline-filters-panel__date-sep" aria-hidden>
            —
          </span>
          <DateInputField
            type="date"
            className="navi-date-filter pipeline-filters-panel__date"
            value={draft.filterDateTo}
            onChange={(e) => patchDraft({ filterDateTo: e.target.value })}
            aria-label="Data final"
          />
        </div>
      </div>

      <div className="pipeline-filters-panel__actions">
        <button type="button" className="btn-primary btn-sm pipeline-filters-panel__apply" onClick={handleApply}>
          <Search size={14} aria-hidden />
          Buscar
        </button>
        {hasDraftActive ? (
          <button type="button" className="btn-outline btn-sm" onClick={handleClear}>
            Limpar
          </button>
        ) : null}
      </div>
    </div>
  );
}
