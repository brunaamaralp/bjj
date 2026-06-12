import React from 'react';
import { Download, ChevronDown, Loader2 } from 'lucide-react';
import FilterBar from '../shared/FilterBar.jsx';
import FieldError from '../shared/FieldError.jsx';
import { DateInputField } from '../DateInput';
import { DropdownMenu, DropdownMenuPanel, DropdownMenuItem } from '../shared/menu';

export default function ReportsPeriodToolbar({
  presets,
  preset,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  dateError,
  showLeadFilters,
  profileFilter,
  onProfileFilterChange,
  exportOpen,
  onExportOpenChange,
  exportDisabled,
  exportTitle,
  exportLoading,
  onExportNewLeads,
  onExportScheduled,
  onExportCompleted,
  onExportMissed,
  onExportConverted,
  convertedExportLabel,
}) {
  return (
    <div className="page-header-card reports-period-toolbar">
      <div className="page-header-row navi-toolbar reports-filters-row reports-filters-row--split">
        <FilterBar className="reports-period-block">
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
            <div className="reports-selects-inline">
              <select
                value={profileFilter}
                onChange={(e) => onProfileFilterChange(e.target.value)}
                aria-label="Filtrar por perfil"
                className="form-input navi-control--toolbar"
              >
                <option value="all">Perfil</option>
                <option value="Adulto">Adulto</option>
                <option value="Criança">Criança</option>
                <option value="Juniores">Juniores</option>
              </select>
            </div>
            {dateError ? <FieldError>{dateError}</FieldError> : null}
            <div className="reports-filters-spacer" />
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
          </>
        ) : null}
      </div>
    </div>
  );
}
