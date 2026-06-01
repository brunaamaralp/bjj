import React from 'react';
import { LEAD_ORIGIN } from '../../store/useLeadStore';
import { DateInputField } from '../DateInput';

function currentMonthYm() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Filtros avançados do funil — aplicam imediatamente ao alterar (sem rascunho).
 */
export default function PipelineAdvancedFilters({
  profileFilter,
  originFilter,
  filterDateFrom,
  filterDateTo,
  enrollmentMonthFilter,
  searchStageScope,
  searchStageScopeOptions,
  onChange,
  onClear,
}) {
  const hasActive =
    profileFilter !== 'all' ||
    originFilter !== 'all' ||
    Boolean(filterDateFrom || filterDateTo || enrollmentMonthFilter) ||
    searchStageScope !== 'all';

  const patch = (updates) => onChange?.(updates);

  const handleEnrollmentMonthChange = (value) => {
    const ym = String(value || '').trim();
    if (ym) {
      patch({
        enrollmentMonthFilter: ym,
        filterDateFrom: '',
        filterDateTo: '',
        quickFilter: null,
      });
      return;
    }
    patch({ enrollmentMonthFilter: '' });
  };

  const handleCustomDateChange = (key, value) => {
    const nextFrom = key === 'filterDateFrom' ? value : filterDateFrom;
    const nextTo = key === 'filterDateTo' ? value : filterDateTo;
    patch({
      [key]: value,
      enrollmentMonthFilter: '',
      quickFilter: nextFrom || nextTo ? null : undefined,
    });
  };

  return (
    <div className="pipeline-filters-panel">
      <div className="pipeline-filters-panel__section">
        <span className="pipeline-filters-panel__label">Etapa</span>
        <select
          className="form-input pipeline-filters-panel__select"
          value={searchStageScope}
          onChange={(e) => patch({ searchStageScope: e.target.value })}
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
        <span className="pipeline-filters-panel__label">Mês de matrícula</span>
        <input
          type="month"
          className="form-input pipeline-filters-panel__select"
          value={enrollmentMonthFilter || ''}
          onChange={(e) => handleEnrollmentMonthChange(e.target.value)}
          aria-label="Filtrar matrículas por mês"
        />
        <p className="pipeline-filters-panel__hint">
          Só entram alunos com data de ingresso preenchida no cadastro.
        </p>
      </div>

      <div className="pipeline-filters-panel__section">
        <span className="pipeline-filters-panel__label">Perfil</span>
        <select
          className="form-input pipeline-filters-panel__select"
          value={profileFilter}
          onChange={(e) => patch({ profileFilter: e.target.value })}
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
          onChange={(e) => patch({ originFilter: e.target.value })}
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
        <span className="pipeline-filters-panel__label">Período do funil</span>
        <p className="pipeline-filters-panel__hint">
          Demais colunas usam data de agendamento ou cadastro do lead.
        </p>
        <div className="pipeline-filters-panel__date-row">
          <DateInputField
            type="date"
            className="navi-date-filter pipeline-filters-panel__date"
            value={filterDateFrom}
            onChange={(e) => handleCustomDateChange('filterDateFrom', e.target.value)}
            aria-label="Data inicial do funil"
          />
          <span className="pipeline-filters-panel__date-sep" aria-hidden>
            —
          </span>
          <DateInputField
            type="date"
            className="navi-date-filter pipeline-filters-panel__date"
            value={filterDateTo}
            onChange={(e) => handleCustomDateChange('filterDateTo', e.target.value)}
            aria-label="Data final do funil"
          />
        </div>
      </div>

      {hasActive ? (
        <div className="pipeline-filters-panel__actions">
          <button type="button" className="btn-outline btn-sm pipeline-filters-panel__clear-all" onClick={onClear}>
            Limpar filtros
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { currentMonthYm };
