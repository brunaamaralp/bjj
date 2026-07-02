import '../../styles/schedules.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ScheduleGridCard from './ScheduleGridCard.jsx';
import { isClassesConfigured, useClassesStore } from '../../store/classesStore.js';
import { isSchedulesConfigured, useSchedulesStore } from '../../store/schedulesStore.js';
import {
  buildWeeklyScheduleGrid,
  collectScheduleModalities,
  filterSchedulesByModality,
} from '../../lib/schedules.js';
import {
  classifyScheduleTimeStatus,
  getTodayWeekdayId,
  readModalityFilter,
  resolveScheduleGridColumns,
  writeModalityFilter,
} from '../../lib/recepcaoScheduleGrid.js';

function SchedulesGridSkeleton() {
  return (
    <div className="schedules-grid-skeleton" role="status" aria-label="Carregando grade de horários">
      <div className="schedules-grid-skeleton__bar" />
      <div className="schedules-grid-skeleton__bar schedules-grid-skeleton__bar--medium" />
      <div className="schedules-grid-skeleton__bar schedules-grid-skeleton__bar--short" />
    </div>
  );
}

function SchedulesWeekTable({ grid, todayId, classById, gridWrapRef, todayColRef }) {
  const now = useMemo(() => new Date(), []);

  return (
    <div
      className="schedules-week-grid-wrap"
      ref={gridWrapRef}
      tabIndex={0}
      aria-label="Grade semanal — deslize horizontalmente para ver todos os dias"
    >
      <p className="schedules-week-grid__scroll-hint text-small text-muted" aria-hidden>
        Deslize para ver todos os dias
      </p>
      <table className="schedules-week-grid">
        <thead>
          <tr>
            <th scope="col" className="schedules-week-grid__time-col schedules-week-grid__time-col--sticky">
              Horário
            </th>
            {grid.columns.map((col) => {
              const isToday = col.id === todayId;
              const cls = isToday ? 'schedules-week-grid__col--today' : '';
              return (
                <th
                  key={col.id}
                  scope="col"
                  className={cls || undefined}
                  ref={isToday ? todayColRef : undefined}
                >
                  {col.label}
                  {isToday ? ' · Hoje' : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.timeStart}>
              <th
                scope="row"
                className="schedules-week-grid__time-col schedules-week-grid__time-col--sticky"
              >
                {row.timeStart}
              </th>
              {grid.columns.map((col) => {
                const isToday = col.id === todayId;
                const cls = isToday ? 'schedules-week-grid__col--today' : '';
                const items = row.cells[col.id] || [];
                return (
                  <td
                    key={col.id}
                    className={[cls, !items.length ? 'schedules-week-grid__cell--empty' : '']
                      .filter(Boolean)
                      .join(' ') || undefined}
                  >
                    {items.length ? (
                      <ul className="schedules-week-grid__cell-list">
                        {items.map((item) => {
                          const timeStatus = isToday
                            ? classifyScheduleTimeStatus(item.time_start, item.time_end, now)
                            : null;
                          return (
                            <ScheduleGridCard
                              key={item.id}
                              item={item}
                              classDoc={classById.get(item.class_id) || null}
                              variant="table"
                              timeStatus={timeStatus}
                            />
                          );
                        })}
                      </ul>
                    ) : (
                      <span className="schedules-week-grid__empty-mark text-muted" aria-hidden>
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RecepcaoSchedulesGrid({ academyId, isOwner = false }) {
  const schedules = useSchedulesStore((s) => s.schedules);
  const loading = useSchedulesStore((s) => s.loading);
  const fetchSchedules = useSchedulesStore((s) => s.fetchSchedules);
  const classes = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);

  const [modalityFilter, setModalityFilter] = useState(() => readModalityFilter());

  const gridWrapRef = useRef(null);
  const todayColRef = useRef(null);
  const didScrollToTodayRef = useRef(false);

  const todayId = getTodayWeekdayId();
  const configured = isSchedulesConfigured();

  useEffect(() => {
    if (!academyId || !configured) return;
    void fetchSchedules(academyId, { activeOnly: true, silent: true });
    if (isClassesConfigured()) {
      void fetchClasses(academyId, { activeOnly: true, silent: true });
    }
  }, [academyId, configured, fetchSchedules, fetchClasses]);

  useEffect(() => {
    if (!gridWrapRef.current || !todayColRef.current || didScrollToTodayRef.current) return;
    didScrollToTodayRef.current = true;
    todayColRef.current.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [schedules.length]);

  const handleModalityFilter = useCallback((value) => {
    setModalityFilter(value);
    writeModalityFilter(value);
  }, []);

  const classById = useMemo(
    () => new Map(classes.map((c) => [c.id, c])),
    [classes]
  );

  const filtered = useMemo(
    () => filterSchedulesByModality(schedules, modalityFilter),
    [schedules, modalityFilter]
  );
  const modalities = useMemo(() => collectScheduleModalities(schedules), [schedules]);
  const columns = useMemo(() => resolveScheduleGridColumns(filtered), [filtered]);
  const grid = useMemo(
    () => buildWeeklyScheduleGrid(filtered, { columns }),
    [filtered, columns]
  );

  if (!configured) return null;

  const emptyDescription = isOwner
    ? 'Configure horários recorrentes vinculados às turmas para exibir a grade na recepção.'
    : 'Peça ao titular da academia para configurar em Minha academia → Horários.';

  return (
    <section className="reception-section schedules-grid-section animate-in" aria-labelledby="schedules-grid-title">
      <div className="reception-section-head schedules-grid-section__head">
        <ReportSectionHeading
          id="schedules-grid-title"
          className="reception-report-heading"
          title={
            <>
              <Clock size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden /> Grade de
              horários
            </>
          }
        />
      </div>

      {modalities.length > 1 ? (
        <div className="schedules-modality-filter" role="group" aria-label="Filtrar por modalidade">
          <button
            type="button"
            className={`schedules-modality-chip${!modalityFilter ? ' schedules-modality-chip--active' : ''}`}
            onClick={() => handleModalityFilter('')}
          >
            Todas
          </button>
          {modalities.map((m) => (
            <button
              key={m}
              type="button"
              className={`schedules-modality-chip${
                modalityFilter === m ? ' schedules-modality-chip--active' : ''
              }`}
              onClick={() => handleModalityFilter(m)}
            >
              {m}
            </button>
          ))}
        </div>
      ) : null}

      {loading && !schedules.length ? <SchedulesGridSkeleton /> : null}

      {!loading && !grid.hasAny ? (
        <EmptyState
          variant="embedded"
          insideCard
          icon={Clock}
          title="Nenhum horário cadastrado"
          description={emptyDescription}
          primaryAction={
            isOwner
              ? { label: 'Configurar horários', href: '/empresa?tab=horarios' }
              : undefined
          }
        />
      ) : null}

      {grid.hasAny ? (
        <SchedulesWeekTable
          grid={grid}
          todayId={todayId}
          classById={classById}
          gridWrapRef={gridWrapRef}
          todayColRef={todayColRef}
        />
      ) : null}
    </section>
  );
}
