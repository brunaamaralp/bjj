import '../../styles/schedules.css';
import React, { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import { isSchedulesConfigured, useSchedulesStore } from '../../store/schedulesStore.js';
import {
  buildWeeklyScheduleGrid,
  collectScheduleModalities,
  filterSchedulesByModality,
} from '../../lib/schedules.js';
import { formatCapacityLabel } from '../../lib/classes.js';

const JS_DAY_TO_ID = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

export default function RecepcaoSchedulesGrid({ academyId, isOwner = false }) {
  const schedules = useSchedulesStore((s) => s.schedules);
  const loading = useSchedulesStore((s) => s.loading);
  const fetchSchedules = useSchedulesStore((s) => s.fetchSchedules);
  const [modalityFilter, setModalityFilter] = useState('');

  const todayId = JS_DAY_TO_ID[new Date().getDay()];
  const configured = isSchedulesConfigured();

  useEffect(() => {
    if (!academyId || !configured) return;
    void fetchSchedules(academyId, { activeOnly: true, silent: true });
  }, [academyId, configured, fetchSchedules]);

  const filtered = useMemo(
    () => filterSchedulesByModality(schedules, modalityFilter),
    [schedules, modalityFilter]
  );
  const modalities = useMemo(() => collectScheduleModalities(schedules), [schedules]);
  const grid = useMemo(() => buildWeeklyScheduleGrid(filtered), [filtered]);

  if (!configured) return null;

  return (
    <section className="reception-section schedules-grid-section animate-in" aria-labelledby="schedules-grid-title">
      <div className="reception-section-head">
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
            onClick={() => setModalityFilter('')}
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
              onClick={() => setModalityFilter(m)}
            >
              {m}
            </button>
          ))}
        </div>
      ) : null}

      {loading && !schedules.length ? (
        <p className="text-small text-muted" role="status">
          Carregando grade…
        </p>
      ) : null}

      {!loading && !grid.hasAny ? (
        <div className="schedules-grid-empty card">
          <p className="text-small text-muted">
            Nenhum horário cadastrado.
            {isOwner ? (
              <>
                {' '}
                Configure em{' '}
                <Link to="/empresa?tab=horarios" className="edit-link">
                  Minha academia → Horários
                </Link>
                .
              </>
            ) : (
              ' Peça ao titular da academia para configurar em Minha academia → Horários.'
            )}
          </p>
        </div>
      ) : null}

      {grid.hasAny ? (
        <div className="schedules-week-grid-wrap">
          <table className="schedules-week-grid">
            <thead>
              <tr>
                <th scope="col" className="schedules-week-grid__time-col">
                  Horário
                </th>
                {grid.columns.map((col) => {
                  const isToday = col.id === todayId;
                  const isSun = col.id === 'sun';
                  const cls = [
                    isToday ? 'schedules-week-grid__col--today' : '',
                    isSun   ? 'schedules-week-grid__col--sun'   : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <th key={col.id} scope="col" className={cls || undefined}>
                      {col.label}{isToday && <span className="schedules-week-grid__today-badge" aria-hidden />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.timeStart}>
                  <th scope="row" className="schedules-week-grid__time-col">
                    {row.timeStart}
                  </th>
                  {grid.columns.map((col) => {
                    const isToday = col.id === todayId;
                    const isSun = col.id === 'sun';
                    const cls = [
                      isToday ? 'schedules-week-grid__col--today' : '',
                      isSun   ? 'schedules-week-grid__col--sun'   : '',
                    ].filter(Boolean).join(' ');
                    const items = row.cells[col.id] || [];
                    return (
                      <td key={col.id} className={cls || undefined}>
                        {items.length ? (
                          <ul className="schedules-week-grid__cell-list">
                            {items.map((item) => (
                              <li key={item.id} className="schedules-week-card">
                                <span className="schedules-week-card__name">{item.name}</span>
                                <span className="schedules-week-card__time text-small text-muted">
                                  {item.time_start}–{item.time_end}
                                </span>
                                {item.instructor ? (
                                  <span className="schedules-week-card__instructor text-small text-muted">
                                    {item.instructor}
                                  </span>
                                ) : null}
                                {item.max_capacity ? (
                                  <span className="schedules-week-card__capacity text-small text-muted">
                                    {formatCapacityLabel(item.max_capacity)}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
