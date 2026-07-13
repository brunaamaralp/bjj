import React from 'react';
import { Download, ChevronDown, Loader2, CalendarRange } from 'lucide-react';
import FilterBar from '../shared/FilterBar.jsx';
import FieldError from '../shared/FieldError.jsx';
import { DateInputField } from '../DateInput';
import { DropdownMenu, DropdownMenuPanel, DropdownMenuItem } from '../shared/menu';

const PROFILE_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'Adulto', label: 'Adulto' },
  { value: 'Criança', label: 'Criança' },
  { value: 'Juniores', label: 'Juniores' },
];

export default function ReportsPeriodToolbar({
  presets,
  preset,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  dateError,
  periodLabel,
  showLeadFilters,
  profileFilter,
  onProfileFilterChange,
  showSalesOperatorFilters,
  operatorFilter,
  onOperatorFilterChange,
  operatorTeam = [],
  exportOpen,
  onExportOpenChange,
  exportDisabled,
  exportTitle,
  exportLoading,
  exportVariant = 'none',
  onExportSingle,
  onExportNewLeads,
  onExportScheduled,
  onExportCompleted,
  onExportMissed,
  onExportConverted,
  convertedExportLabel,
}) {
  const showExport = exportVariant === 'menu' || exportVariant === 'single';

  return (
    <div className="page-header-card reports-period-toolbar">
      <div className="page-header-row navi-toolbar reports-filters-row reports-filters-row--split">
        <FilterBar className="reports-period-block">
          {periodLabel ? (
            <>
              <p className="reports-period-summary" aria-live="polite">
                <CalendarRange size={15} strokeWidth={2} aria-hidden />
                <span>{periodLabel}</span>
              </p>
              <span className="reports-filters-divider reports-filters-divider--inline" aria-hidden />
            </>
          ) : null}
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`filter-chip${preset === p.key ? ' is-active' : ''}`}
              onClick={() => onPresetChange(p.key)}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' ? (
            <>
              <DateInputField
                type="date"
                className="form-input navi-date-filter navi-control--toolbar"
                value={from}
                onChange={(e) => onFromChange(e.target.value)}
                aria-label="Data inicial"
              />
              <span className="reports-date-separator" aria-hidden>
                —
              </span>
              <DateInputField
                type="date"
                className="form-input navi-date-filter navi-control--toolbar"
                value={to}
                onChange={(e) => onToChange(e.target.value)}
                aria-label="Data final"
              />
            </>
          ) : null}
        </FilterBar>

        {showLeadFilters ? (
          <>
            <div className="reports-filters-divider" aria-hidden />
            <div className="reports-selects-inline" role="toolbar" aria-label="Filtrar por perfil">
              <span className="navi-eyebrow">Perfil</span>
              <div className="filter-strip">
                {PROFILE_FILTERS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={`filter-chip${profileFilter === p.value ? ' is-active' : ''}`}
                    onClick={() => onProfileFilterChange(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {showSalesOperatorFilters ? (
          <>
            <div className="reports-filters-divider" aria-hidden />
            <div className="reports-selects-inline" role="toolbar" aria-label="Filtrar por operador">
              <span className="navi-eyebrow">Operador</span>
              <div className="filter-strip">
                <button
                  type="button"
                  className={`filter-chip${!operatorFilter ? ' is-active' : ''}`}
                  onClick={() => onOperatorFilterChange('')}
                >
                  Todos
                </button>
                {operatorTeam.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`filter-chip${operatorFilter === m.id ? ' is-active' : ''}`}
                    onClick={() => onOperatorFilterChange(m.id)}
                  >
                    {m.nome}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {dateError ? <FieldError>{dateError}</FieldError> : null}
        <div className="reports-filters-spacer" />

        {showExport ? (
          exportVariant === 'menu' ? (
            <DropdownMenu
              open={exportOpen}
              onOpenChange={onExportOpenChange}
              align="end"
              className="reports-export-wrap"
            >
              <button
                type="button"
                className="btn-secondary reports-export-btn reports-export-btn--icon"
                onClick={() => !exportDisabled && onExportOpenChange(!exportOpen)}
                aria-expanded={exportOpen}
                aria-haspopup="menu"
                aria-label={exportTitle || 'Exportar relatório'}
                disabled={exportDisabled}
                title={exportTitle}
              >
                {exportLoading ? (
                  <Loader2 size={16} className="reports-spin" aria-hidden />
                ) : (
                  <>
                    <Download size={16} aria-hidden />
                    <ChevronDown size={14} className={exportOpen ? 'reports-chevron-open' : ''} aria-hidden />
                  </>
                )}
              </button>
              {exportOpen ? (
                <DropdownMenuPanel className="reports-export-menu">
                  <DropdownMenuItem onClick={onExportNewLeads}>Novos no período</DropdownMenuItem>
                  <DropdownMenuItem onClick={onExportScheduled}>Agendados</DropdownMenuItem>
                  <DropdownMenuItem onClick={onExportCompleted}>Compareceram</DropdownMenuItem>
                  <DropdownMenuItem onClick={onExportMissed}>Não compareceram</DropdownMenuItem>
                  <DropdownMenuItem onClick={onExportConverted}>{convertedExportLabel}</DropdownMenuItem>
                </DropdownMenuPanel>
              ) : null}
            </DropdownMenu>
          ) : (
            <button
              type="button"
              className="btn-secondary reports-export-btn reports-export-btn--icon"
              onClick={() => !exportDisabled && onExportSingle?.()}
              aria-label={exportTitle || 'Exportar CSV'}
              disabled={exportDisabled}
              title={exportTitle}
            >
              {exportLoading ? (
                <Loader2 size={16} className="reports-spin" aria-hidden />
              ) : (
                <Download size={16} aria-hidden />
              )}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
