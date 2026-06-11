import React, { memo } from 'react';
import { Calendar, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AgendaCalendarWeek, { formatWeekRangeLabel } from '../AgendaCalendarWeek.jsx';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import { LEAD_PROFILE_FROM_DASHBOARD } from '../../lib/pipelineSessionState.js';
function DashboardAgendaWeekPanel({
  weekSectionRef,
  weekOffset,
  onWeekOffsetChange,
  onRefresh,
  loading,
  isRefreshing,
  onCompareceu,
  onNaoCompareceu,
  savingPresence,
  isDashboardMobile,
  vertical,
  trialSeriesPlural,
  agendaWeekLeads,
  visibleWeekCount,
}) {
  const navigate = useNavigate();

  return (
    <section
      ref={weekSectionRef}
      className="animate-in agenda-week-section reception-section reception-week-panel reception-week-panel--secondary"
      style={{ animationDelay: '0.15s' }}
    >
      <div className="reception-week-panel__head">
        <div className="reception-week-panel__title-row">
          <ReportSectionHeading
            className="reception-report-heading reception-week-panel__title"
            title={
              <>
                <Calendar size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden />
                Agenda da semana
              </>
            }
            action={
              <span className="badge reception-week-count-badge" title={`${trialSeriesPlural} na semana exibida`}>
                {visibleWeekCount}
              </span>
            }
          />
        </div>
        <div className="week-nav-pill">
          <button
            type="button"
            className="week-nav-pill__btn"
            onClick={() => onWeekOffsetChange(weekOffset - 1)}
            aria-label="Semana anterior"
          >
            ‹
          </button>
          <span className="week-nav-pill__range" aria-live="polite">
            {formatWeekRangeLabel(weekOffset, { endOnSaturday: true })}
          </span>
          <button
            type="button"
            className="week-nav-pill__btn"
            onClick={() => onWeekOffsetChange(weekOffset + 1)}
            aria-label="Próxima semana"
          >
            ›
          </button>
          <button
            type="button"
            className="week-nav-pill__refresh"
            onClick={onRefresh}
            disabled={loading || isRefreshing}
            aria-label="Atualizar agenda"
          >
            <RefreshCcw size={16} className={isRefreshing ? 'spin-refresh' : ''} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="agenda-week-fullwidth reception-week-embed">
        <AgendaCalendarWeek
          leads={agendaWeekLeads}
          onCompareceu={onCompareceu}
          onNaoCompareceu={onNaoCompareceu}
          onOpenLead={(lead) =>
            navigate(`/lead/${lead.id}`, { state: { from: LEAD_PROFILE_FROM_DASHBOARD } })
          }
          savingPresence={savingPresence}
          weekOffset={weekOffset}
          onWeekOffsetChange={onWeekOffsetChange}
          hideNav
          prioritizeTodayOnMobile={isDashboardMobile}
          vertical={vertical}
        />
      </div>
      {visibleWeekCount > 0 ? (
        <p className="reception-calendar-hint">
          Toque no card para abrir o contato · use Veio / Não veio para registrar presença
        </p>
      ) : null}
    </section>
  );
}

export default memo(DashboardAgendaWeekPanel);
