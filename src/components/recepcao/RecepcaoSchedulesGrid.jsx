import '../../styles/schedules.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ScheduleGridCard from './ScheduleGridCard.jsx';
import { isClassesConfigured, useClassesStore } from '../../store/classesStore.js';
import { isClassSlotsConfigured, useClassSlotsStore } from '../../store/classSlotsStore.js';
import { isSchedulesConfigured, useSchedulesStore } from '../../store/schedulesStore.js';
import {
  buildWeeklyScheduleGrid,
  collectScheduleModalities,
  filterSchedulesByModality,
} from '../../lib/schedules.js';
import {
  flattenTodaySchedules,
  getTodayWeekdayId,
  readModalityFilter,
  resolveScheduleCardContext,
  resolveScheduleGridColumns,
  slotByScheduleIdForDate,
  todayYmd,
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

function SchedulesWeekTable({
  grid,
  todayId,
  classById,
  slotByScheduleId,
  gridWrapRef,
  todayColRef,
}) {
  const now = useMemo(() => new Date(), []);

  return (
    <div
      className="schedules-week-grid-wrap"
      ref={gridWrapRef}
      tabIndex={0}
      aria-label="Grade semanal — deslize horizontalmente para ver todos os dias"
    >
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
                          const { timeStatus, occupancy } = resolveScheduleCardContext(item, {
                            isToday,
                            slotByScheduleId,
                            nowDate: now,
                          });
                          return (
                            <ScheduleGridCard
                              key={item.id}
                              item={item}
                              classDoc={classById.get(item.class_id) || null}
                              variant="table"
                              timeStatus={timeStatus}
                              occupancy={occupancy}
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
  const slots = useClassSlotsStore((s) => s.slots);
  const fetchSlotsForDate = useClassSlotsStore((s) => s.fetchSlotsForDate);

  const [modalityFilter, setModalityFilter] = useState(() => readModalityFilter());
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
  );

  const gridWrapRef = useRef(null);
  const todayColRef = useRef(null);
  const didScrollToTodayRef = useRef(false);

  const todayId = getTodayWeekdayId();
  const todayDate = todayYmd();
  const configured = isSchedulesConfigured();
  const slotsConfigured = isClassSlotsConfigured();

  useEffect(() => {
    if (!academyId || !configured) return;
    void fetchSchedules(academyId, { activeOnly: true, silent: true });
    if (isClassesConfigured()) {
      void fetchClasses(academyId, { activeOnly: true, silent: true });
    }
    if (slotsConfigured) {
      void fetchSlotsForDate(academyId, todayDate, { silent: true });
    }
  }, [academyId, configured, slotsConfigured, todayDate, fetchSchedules, fetchClasses, fetchSlotsForDate]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 720px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (isMobile || !gridWrapRef.current || !todayColRef.current || didScrollToTodayRef.current) return;
    didScrollToTodayRef.current = true;
    todayColRef.current.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [isMobile, schedules.length]);

  const handleModalityFilter = useCallback((value) => {
    setModalityFilter(value);
    writeModalityFilter(value);
  }, []);

  const classById = useMemo(
    () => new Map(classes.map((c) => [c.id, c])),
    [classes]
  );

  const slotByScheduleId = useMemo(
    () => slotByScheduleIdForDate(slots, todayDate),
    [slots, todayDate]
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
  const todayItems = useMemo(() => flattenTodaySchedules(grid, todayId), [grid, todayId]);
  const now = useMemo(() => new Date(), []);

  if (!configured) return null;

  const emptyDescription = isOwner
    ? 'Configure horários recorrentes vinculados às turmas para exibir a grade na recepção.'
    : 'Peça ao titular da academia para configurar em Minha academia → Horários.';

  return (
    <section
      className={`reception-section schedules-grid-section animate-in${
        isMobile && !mobileExpanded ? ' schedules-grid-section--collapsed' : ''
      }`}
      aria-labelledby="schedules-grid-title"
    >
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
        {isOwner ? (
          <Link to="/empresa?tab=horarios" className="edit-link schedules-grid-section__edit">
            Editar horários
          </Link>
        ) : null}
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

      {grid.hasAny && isMobile ? (
        <>
          <button
            type="button"
            className="schedules-grid-collapse__toggle"
            aria-expanded={mobileExpanded}
            aria-controls="schedules-grid-mobile-panel"
            onClick={() => setMobileExpanded((v) => !v)}
          >
            {mobileExpanded ? (
              <ChevronDown size={16} strokeWidth={2} aria-hidden />
            ) : (
              <ChevronRight size={16} strokeWidth={2} aria-hidden />
            )}
            {mobileExpanded ? 'Ocultar grade da semana' : 'Ver grade da semana'}
          </button>
          {mobileExpanded ? (
            <div id="schedules-grid-mobile-panel" className="schedules-grid-collapse__panel">
              <p className="text-small text-muted schedules-today-list__lead">
                Aulas de {grid.columns.find((c) => c.id === todayId)?.label || 'hoje'}:
              </p>
              {todayItems.length ? (
                <ul className="schedules-today-list">
                  {todayItems.map((item) => {
                    const { timeStatus, occupancy } = resolveScheduleCardContext(item, {
                      isToday: true,
                      slotByScheduleId,
                      nowDate: now,
                    });
                    return (
                      <ScheduleGridCard
                        key={item.id}
                        item={item}
                        classDoc={classById.get(item.class_id) || null}
                        variant="list"
                        timeStatus={timeStatus}
                        occupancy={occupancy}
                      />
                    );
                  })}
                </ul>
              ) : (
                <p className="text-small text-muted">Nenhuma aula cadastrada para hoje.</p>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {grid.hasAny && !isMobile ? (
        <SchedulesWeekTable
          grid={grid}
          todayId={todayId}
          classById={classById}
          slotByScheduleId={slotByScheduleId}
          gridWrapRef={gridWrapRef}
          todayColRef={todayColRef}
        />
      ) : null}
    </section>
  );
}
