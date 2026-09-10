import '../../styles/schedules.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ScheduleGridCard from './ScheduleGridCard.jsx';
import ConfirmLessonStaffModal from './ConfirmLessonStaffModal.jsx';
import { isClassesConfigured, useClassesStore } from '../../store/classesStore.js';
import { isSchedulesConfigured, useSchedulesStore } from '../../store/schedulesStore.js';
import { isClassSlotsConfigured, useClassSlotsStore } from '../../store/classSlotsStore.js';
import { useStaffRosterStore, isStaffRosterConfigured } from '../../store/staffRosterStore.js';
import { fetchTeamMemberships } from '../../lib/teamApi.js';
import { normalizeReportsOperatorTeam } from '../../lib/reportsOperatorTeam.js';
import { buildLessonStaffPickerOptions } from '../../../lib/staffRoster.js';
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
  scrollChildHorizontallyIntoContainer,
  slotByScheduleIdForDate,
  weekYmdRangeForColumns,
  writeModalityFilter,
  ymdForWeekdayId,
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
  gridWrapRef,
  todayColRef,
  slots,
  onSelectLesson,
}) {
  const now = useMemo(() => new Date(), []);

  const slotsByDate = useMemo(() => {
    /** @type {Map<string, Map<string, object>>} */
    const byDate = new Map();
    const dates = new Set((slots || []).map((s) => String(s.slot_date || '').trim()).filter(Boolean));
    for (const col of grid.columns || []) {
      const ymd = ymdForWeekdayId(col.id);
      dates.add(ymd);
    }
    for (const ymd of dates) {
      byDate.set(ymd, slotByScheduleIdForDate(slots, ymd));
    }
    return byDate;
  }, [slots, grid.columns]);

  return (
    <div
      className="schedules-week-grid-wrap"
      ref={gridWrapRef}
      tabIndex={0}
      aria-label="Grade semanal — clique numa aula para confirmar professor e instrutor"
    >
      <p className="schedules-week-grid__scroll-hint text-small text-muted" aria-hidden>
        Deslize para ver todos os dias · clique na aula para confirmar a equipe
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
                const dateYmd = ymdForWeekdayId(col.id);
                const slotMap = slotsByDate.get(dateYmd) || new Map();
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
                          const slot = slotMap.get(String(item.id || '')) || null;
                          return (
                            <ScheduleGridCard
                              key={item.id}
                              item={item}
                              classDoc={classById.get(item.class_id) || null}
                              variant="table"
                              timeStatus={timeStatus}
                              slot={slot}
                              dateLabel={dateYmd}
                              onSelect={() => onSelectLesson?.({ schedule: item, slot, dateYmd })}
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
  const fetchSlotsForRange = useClassSlotsStore((s) => s.fetchSlotsForRange);
  const upsertSlot = useClassSlotsStore((s) => s.upsertSlot);

  const roster = useStaffRosterStore((s) => s.roster);
  const fetchRoster = useStaffRosterStore((s) => s.fetchRoster);

  const [modalityFilter, setModalityFilter] = useState(() => readModalityFilter());
  const [teamMembers, setTeamMembers] = useState([]);
  const [active, setActive] = useState(null);

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
    if (!academyId) return;
    let cancelled = false;
    fetchTeamMemberships(academyId)
      .then((data) => {
        if (!cancelled) setTeamMembers(normalizeReportsOperatorTeam(data));
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  useEffect(() => {
    if (!academyId || !isStaffRosterConfigured()) return;
    void fetchRoster(academyId, { activeOnly: true });
  }, [academyId, fetchRoster]);

  const staffOptions = useMemo(
    () => buildLessonStaffPickerOptions({ teamMembers, roster }),
    [teamMembers, roster]
  );

  useEffect(() => {
    if (!gridWrapRef.current || !todayColRef.current || didScrollToTodayRef.current) return;
    didScrollToTodayRef.current = true;
    scrollChildHorizontallyIntoContainer(gridWrapRef.current, todayColRef.current, {
      behavior: 'smooth',
    });
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

  const weekRange = useMemo(
    () => weekYmdRangeForColumns(columns.map((c) => c.id)),
    [columns]
  );

  useEffect(() => {
    if (!academyId || !isClassSlotsConfigured() || !weekRange.from || !weekRange.to) return;
    void fetchSlotsForRange(academyId, weekRange.from, weekRange.to, { silent: true });
  }, [academyId, weekRange.from, weekRange.to, fetchSlotsForRange]);

  const handleSaved = useCallback(
    (slot) => {
      if (slot) upsertSlot(slot);
      if (academyId && weekRange.from && weekRange.to) {
        void fetchSlotsForRange(academyId, weekRange.from, weekRange.to, {
          force: true,
          silent: true,
        });
      }
    },
    [academyId, fetchSlotsForRange, upsertSlot, weekRange.from, weekRange.to]
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
        <p className="reception-section-lead text-small text-muted schedules-grid-section__lead">
          Clique numa aula para confirmar professor e instrutor
        </p>
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
          slots={slots}
          onSelectLesson={setActive}
        />
      ) : null}

      <ConfirmLessonStaffModal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        schedule={active?.schedule || null}
        slot={active?.slot || null}
        dateYmd={active?.dateYmd || ''}
        teamMembers={staffOptions}
        onSaved={handleSaved}
      />
    </section>
  );
}
