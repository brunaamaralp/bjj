import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, CircleDashed, Clock3, UserX } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';
import ConfirmLessonStaffModal from './ConfirmLessonStaffModal.jsx';
import { isSchedulesConfigured, useSchedulesStore } from '../../store/schedulesStore.js';
import { useClassSlotsStore, isClassSlotsConfigured } from '../../store/classSlotsStore.js';
import { fetchTeamMemberships } from '../../lib/teamApi.js';
import { normalizeReportsOperatorTeam } from '../../lib/reportsOperatorTeam.js';
import { useStaffRosterStore, isStaffRosterConfigured } from '../../store/staffRosterStore.js';
import { buildLessonStaffPickerOptions } from '../../../lib/staffRoster.js';
import {
  buildWeeklyScheduleGrid,
  filterSchedulesByModality,
} from '../../lib/schedules.js';
import {
  classifyScheduleTimeStatus,
  flattenTodaySchedules,
  getTodayWeekdayId,
  resolveScheduleGridColumns,
  scheduleTimeStatusLabel,
  todayYmd,
} from '../../lib/recepcaoScheduleGrid.js';
import {
  LESSON_STATUS_CANCELLED,
  LESSON_STATUS_CONFIRMED,
  normalizeLessonStatus,
} from '../../../lib/lessonStaffRegister.js';

function formatDateLabel(ymd) {
  const raw = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  }).format(dt);
}

function lessonBadge(slot) {
  const status = normalizeLessonStatus(slot?.lesson_status);
  if (status === LESSON_STATUS_CONFIRMED) {
    const names = [slot.professor_name, slot.instructor_name].filter(Boolean).join(' · ');
    return {
      tone: 'ok',
      icon: CheckCircle2,
      label: names || 'Confirmada',
      shortLabel: 'Confirmada',
    };
  }
  if (status === LESSON_STATUS_CANCELLED) {
    const reason = String(slot?.lesson_cancel_reason || '').trim();
    return {
      tone: 'warn',
      icon: UserX,
      label: reason || 'Não houve aula',
      shortLabel: 'Não houve',
    };
  }
  return {
    tone: 'pending',
    icon: CircleDashed,
    label: 'Confirmar staff',
    shortLabel: 'Pendente',
  };
}

/**
 * @param {{ academyId: string }} props
 */
export default function RecepcaoTodayLessonsSection({ academyId }) {
  const schedules = useSchedulesStore((s) => s.schedules);
  const loadingSchedules = useSchedulesStore((s) => s.loading);
  const fetchSchedules = useSchedulesStore((s) => s.fetchSchedules);
  const slots = useClassSlotsStore((s) => s.slots);
  const fetchSlotsForDate = useClassSlotsStore((s) => s.fetchSlotsForDate);
  const patchSlot = useClassSlotsStore((s) => s.patchSlot);

  const date = useMemo(() => todayYmd(), []);
  const todayId = useMemo(() => getTodayWeekdayId(), []);
  const now = useMemo(() => new Date(), []);

  const roster = useStaffRosterStore((s) => s.roster);
  const fetchRoster = useStaffRosterStore((s) => s.fetchRoster);

  const [teamMembers, setTeamMembers] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!academyId || !isSchedulesConfigured()) return;
    fetchSchedules(academyId);
  }, [academyId, fetchSchedules]);

  useEffect(() => {
    if (!academyId || !isClassSlotsConfigured()) return;
    fetchSlotsForDate(academyId, date, { force: true });
  }, [academyId, date, fetchSlotsForDate]);

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

  const todaySchedules = useMemo(() => {
    const activeSchedules = filterSchedulesByModality(schedules, '');
    const columns = resolveScheduleGridColumns(activeSchedules);
    const grid = buildWeeklyScheduleGrid(activeSchedules, columns);
    return flattenTodaySchedules(grid, todayId);
  }, [schedules, todayId]);

  const pendingCount = useMemo(
    () =>
      todaySchedules.filter((item) => {
        const slot = slots.find((s) => String(s.schedule_id || '') === String(item.id || ''));
        return normalizeLessonStatus(slot?.lesson_status) === '';
      }).length,
    [todaySchedules, slots]
  );

  const slotByScheduleId = useMemo(() => {
    const map = new Map();
    for (const s of slots || []) {
      const sid = String(s.schedule_id || '').trim();
      if (sid) map.set(sid, s);
    }
    return map;
  }, [slots]);

  const handleSaved = useCallback(
    (slot) => {
      if (slot?.id && slots.some((s) => s.id === slot.id)) {
        patchSlot(slot.id, slot);
      }
      if (academyId) fetchSlotsForDate(academyId, date, { force: true });
    },
    [academyId, date, fetchSlotsForDate, patchSlot, slots]
  );

  if (!isSchedulesConfigured()) return null;

  return (
    <section
      className="reception-section recepcao-today-lessons animate-in"
      aria-labelledby="recepcao-today-lessons-heading"
    >
      <div className="reception-section-head recepcao-today-lessons__head-block">
        <div className="recepcao-today-lessons__title-wrap">
          <h2 id="recepcao-today-lessons-heading" className="reception-section-heading">
            <Clock3 size={18} aria-hidden />
            Aulas de hoje
          </h2>
          <p className="reception-section-lead text-small text-muted">
            {formatDateLabel(date)} · confirme professor e instrutor
          </p>
        </div>
        {pendingCount > 0 ? (
          <span className="recepcao-today-lessons__pending-chip" role="status">
            {pendingCount} pendente{pendingCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {loadingSchedules && !todaySchedules.length ? (
        <p className="text-muted text-small" role="status">
          Carregando aulas…
        </p>
      ) : !todaySchedules.length ? (
        <EmptyState
          variant="compact"
          tone="dashed"
          title="Nenhuma aula na grade para hoje"
          description="Cadastre horários em Minha academia → Horários."
        />
      ) : (
        <ul className="recepcao-today-lessons__list">
          {todaySchedules.map((item) => {
            const slot = slotByScheduleId.get(item.id) || null;
            const badge = lessonBadge(slot);
            const Icon = badge.icon;
            const timeStatus = classifyScheduleTimeStatus(item.time_start, item.time_end, now);
            const timeLabel = scheduleTimeStatusLabel(timeStatus);
            const modality = String(item.modality || '').trim();
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={[
                    'recepcao-today-lessons__card',
                    `recepcao-today-lessons__card--${badge.tone}`,
                    timeStatus === 'ongoing' ? 'recepcao-today-lessons__card--ongoing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setActive({ schedule: item, slot })}
                  aria-label={`${item.name}, ${item.time_start} às ${item.time_end}. ${badge.shortLabel}. Abrir confirmação`}
                >
                  <div className="recepcao-today-lessons__card-main">
                    <div className="recepcao-today-lessons__card-top">
                      <span className="recepcao-today-lessons__time">
                        {item.time_start}–{item.time_end}
                      </span>
                      {timeLabel ? (
                        <span
                          className={`recepcao-today-lessons__time-status recepcao-today-lessons__time-status--${timeStatus}`}
                        >
                          {timeLabel}
                        </span>
                      ) : null}
                    </div>
                    <span className="recepcao-today-lessons__name">{item.name}</span>
                    {modality ? (
                      <span className="recepcao-today-lessons__modality text-small text-muted">
                        {modality}
                      </span>
                    ) : null}
                    <span
                      className={`recepcao-today-lessons__badge recepcao-today-lessons__badge--${badge.tone}`}
                    >
                      <Icon size={14} aria-hidden />
                      <span className="recepcao-today-lessons__badge-text">{badge.label}</span>
                    </span>
                  </div>
                  <ChevronRight
                    className="recepcao-today-lessons__chevron"
                    size={18}
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmLessonStaffModal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        schedule={active?.schedule || null}
        slot={active?.slot || null}
        dateYmd={date}
        teamMembers={staffOptions}
        onSaved={handleSaved}
      />
    </section>
  );
}
