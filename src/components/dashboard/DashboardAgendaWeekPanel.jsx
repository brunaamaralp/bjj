import React, { memo, useEffect, useState } from 'react';
import { Calendar, ChevronDown, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AgendaCalendarWeek, { formatWeekRangeLabel } from '../AgendaCalendarWeek.jsx';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import { LEAD_PROFILE_FROM_DASHBOARD } from '../../lib/pipelineSessionState.js';

const AGENDA_EXPERIMENTAIS_TITLE = 'Agenda de experimentais';

function AgendaExperimentaisTitle({ badgeCount, badgeTitle }) {
  return (
    <span className="agenda-week-title-with-badge">
      <Calendar size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden />
      <span>{AGENDA_EXPERIMENTAIS_TITLE}</span>
      <span className="badge reception-week-count-badge" title={badgeTitle}>
        {badgeCount}
      </span>
    </span>
  );
}

function DashboardAgendaWeekPanel({
  weekSectionRef,
  weekOffset,
  onWeekOffsetChange,
  onRefresh,
  loading,
  isRefreshing,
  onCompareceu,
  onNaoCompareceu,
  onDesfazerPresenca,
  savingPresence,
  isDashboardMobile,
  vertical,
  trialSeriesPlural,
  agendaWeekLeads,
  visibleWeekCount,
  todayCount = 0,
  expandWeekSignal = 0,
}) {
  const navigate = useNavigate();
  const [weekExpanded, setWeekExpanded] = useState(() => !isDashboardMobile);

  useEffect(() => {
    if (!isDashboardMobile) {
      setWeekExpanded(true);
    }
  }, [isDashboardMobile]);

  useEffect(() => {
    if (expandWeekSignal > 0 && isDashboardMobile) {
      setWeekExpanded(true);
    }
  }, [expandWeekSignal, isDashboardMobile]);

  const showWeekView = !isDashboardMobile || weekExpanded;
  const badgeCount = showWeekView ? visibleWeekCount : todayCount;
  const badgeTitle = showWeekView
    ? `${trialSeriesPlural} na semana exibida`
    : `${trialSeriesPlural} agendadas hoje`;

  const handleCollapseWeek = () => {
    if (weekOffset !== 0) onWeekOffsetChange(0);
    setWeekExpanded(false);
  };

  return (
    <section
      ref={weekSectionRef}
      className={`animate-in agenda-week-section reception-section reception-week-panel reception-week-panel--secondary${
        isDashboardMobile && !showWeekView ? ' reception-week-panel--today-only' : ''
      }`}
      style={{ animationDelay: '0.15s' }}
    >
      <div className="reception-week-panel__head">
        {isDashboardMobile && showWeekView ? (
          <button
            type="button"
            className="agenda-week-section__toggle"
            onClick={handleCollapseWeek}
            aria-expanded
            aria-controls="agenda-week-panel-body"
          >
            <span className="agenda-week-section__toggle-label">
              <ReportSectionHeading
                className="reception-report-heading reception-week-panel__title"
                title={<AgendaExperimentaisTitle badgeCount={badgeCount} badgeTitle={badgeTitle} />}
              />
            </span>
            <ChevronDown
              size={18}
              strokeWidth={2}
              className="agenda-week-section__chevron agenda-week-section__chevron--open"
              aria-hidden
            />
          </button>
        ) : (
          <div className="reception-week-panel__title-row">
            <ReportSectionHeading
              className="reception-report-heading reception-week-panel__title"
              title={<AgendaExperimentaisTitle badgeCount={badgeCount} badgeTitle={badgeTitle} />}
            />
            {isDashboardMobile && !showWeekView ? (
              <button
                type="button"
                className="reception-week-panel__refresh-btn"
                onClick={onRefresh}
                disabled={loading || isRefreshing}
                aria-label="Atualizar agenda de hoje"
              >
                <RefreshCcw size={16} className={isRefreshing ? 'spin-refresh' : ''} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        )}
        {showWeekView ? (
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
        ) : null}
      </div>
      <div id="agenda-week-panel-body" className="agenda-week-fullwidth reception-week-embed">
        <AgendaCalendarWeek
          leads={agendaWeekLeads}
          onCompareceu={onCompareceu}
          onNaoCompareceu={onNaoCompareceu}
          onDesfazerPresenca={onDesfazerPresenca}
          onOpenLead={(lead) =>
            navigate(`/lead/${lead.id}`, { state: { from: LEAD_PROFILE_FROM_DASHBOARD } })
          }
          savingPresence={savingPresence}
          weekOffset={showWeekView ? weekOffset : 0}
          onWeekOffsetChange={onWeekOffsetChange}
          hideNav
          prioritizeTodayOnMobile={isDashboardMobile && showWeekView}
          todayOnly={isDashboardMobile && !showWeekView}
          vertical={vertical}
        />
      </div>
      {badgeCount > 0 ? (
        <p className="reception-calendar-hint">
          Toque no card para abrir o contato · Veio / Não veio registram presença · troque ou desfaça se marcou errado
        </p>
      ) : null}
      {isDashboardMobile && !showWeekView ? (
        <button
          type="button"
          className="agenda-week-expand-btn"
          onClick={() => setWeekExpanded(true)}
          aria-expanded={false}
          aria-controls="agenda-week-panel-body"
        >
          Ver semana
          <ChevronDown size={16} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </section>
  );
}

export default memo(DashboardAgendaWeekPanel);
