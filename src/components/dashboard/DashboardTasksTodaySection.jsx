import React from 'react';
import { CheckSquare, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import TaskCard from '../shared/TaskCard.jsx';
import { tasksDueHubHref } from '../../lib/proactiveHub.js';

const TASKS_PREVIEW_MAX = 3;

/**
 * Tarefas vencidas ou que vencem hoje — aba Comercial da Recepção.
 */
export default function DashboardTasksTodaySection({
  tasks = [],
  totalCount = 0,
  overdueCount = 0,
  dueTodayCount = 0,
  isDashboardMobile = false,
  panelOpen = true,
  onTogglePanel,
  onCompleteTask,
  isUpdatingTask,
  onOpenTask,
}) {
  if (totalCount <= 0) return null;

  const preview = tasks.slice(0, TASKS_PREVIEW_MAX);
  const href = tasksDueHubHref(overdueCount, dueTodayCount);

  const body = (
    <div className="dashboard-tasks-today__body">
      <ul className="dashboard-tasks-today__list">
        {preview.map((task) => (
          <li key={task.id}>
            <TaskCard
              task={task}
              variant="compact"
              showLead
              showAssignee={false}
              isUpdating={isUpdatingTask(String(task.id))}
              onComplete={() => onCompleteTask(task)}
              onOpen={onOpenTask}
            />
          </li>
        ))}
      </ul>
      {totalCount > TASKS_PREVIEW_MAX || totalCount > preview.length ? (
        <Link to={href} className="dashboard-tasks-today__more link-subtle text-small">
          Ver todas ({totalCount})
        </Link>
      ) : (
        <Link to={href} className="dashboard-tasks-today__more link-subtle text-small">
          Abrir tarefas
        </Link>
      )}
    </div>
  );

  return (
    <section
      id="tasks-today"
      className={`dashboard-tasks-today reception-section animate-in${
        isDashboardMobile && !panelOpen ? ' dashboard-tasks-today--collapsed' : ''
      }`}
      aria-labelledby="tasks-today-heading"
    >
      <div className="reception-section-head dashboard-tasks-today__head">
        {isDashboardMobile ? (
          <button
            type="button"
            className="dashboard-tasks-today__toggle"
            onClick={onTogglePanel}
            aria-expanded={panelOpen}
            aria-controls="tasks-today-panel-body"
          >
            <span className="dashboard-tasks-today__toggle-label flex items-center gap-2 flex-wrap min-w-0">
              <ReportSectionHeading
                className="reception-report-heading"
                title={
                  <>
                    <CheckSquare size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden />
                    Tarefas de hoje
                  </>
                }
              />
              <span className="badge badge-secondary reception-section-badge">{totalCount}</span>
            </span>
            <ChevronDown
              size={18}
              strokeWidth={2}
              className={`dashboard-tasks-today__chevron${panelOpen ? ' dashboard-tasks-today__chevron--open' : ''}`}
              aria-hidden
            />
          </button>
        ) : (
          <div className="dashboard-tasks-today__toggle dashboard-tasks-today__toggle--static">
            <span className="dashboard-tasks-today__toggle-label flex items-center gap-2 flex-wrap min-w-0">
              <ReportSectionHeading
                id="tasks-today-heading"
                className="reception-report-heading"
                title={
                  <>
                    <CheckSquare size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden />
                    Tarefas de hoje
                  </>
                }
              />
              <span className="badge badge-secondary reception-section-badge">{totalCount}</span>
            </span>
          </div>
        )}
      </div>
      <div id="tasks-today-panel-body" className="dashboard-tasks-today__panel">
        {isDashboardMobile && !panelOpen ? null : body}
      </div>
    </section>
  );
}
