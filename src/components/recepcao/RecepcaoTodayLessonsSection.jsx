import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, UserX } from 'lucide-react';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ConfirmLessonStaffModal from './ConfirmLessonStaffModal.jsx';
import { isSchedulesConfigured, useSchedulesStore } from '../../store/schedulesStore.js';
import { useClassSlotsStore, isClassSlotsConfigured } from '../../store/classSlotsStore.js';
import { fetchTeamMemberships } from '../../lib/teamApi.js';
import { normalizeReportsOperatorTeam } from '../../lib/reportsOperatorTeam.js';
import {
  buildWeeklyScheduleGrid,
  filterSchedulesByModality,
} from '../../lib/schedules.js';
import {
  flattenTodaySchedules,
  getTodayWeekdayId,
  resolveScheduleGridColumns,
  todayYmd,
} from '../../lib/recepcaoScheduleGrid.js';
import {
  LESSON_STATUS_CANCELLED,
  LESSON_STATUS_CONFIRMED,
  normalizeLessonStatus,
} from '../../../lib/lessonStaffRegister.js';

function lessonBadge(slot) {
  const status = normalizeLessonStatus(slot?.lesson_status);
  if (status === LESSON_STATUS_CONFIRMED) {
    const names = [slot.professor_name, slot.instructor_name].filter(Boolean).join(' · ');
    return {
      tone: 'ok',
      icon: CheckCircle2,
      label: names ? `Confirmada · ${names}` : 'Confirmada',
    };
  }
  if (status === LESSON_STATUS_CANCELLED) {
    const reason = String(slot?.lesson_cancel_reason || '').trim();
    return {
      tone: 'warn',
      icon: UserX,
      label: reason ? `Não houve · ${reason}` : 'Não houve',
    };
  }
  return { tone: 'pending', icon: CircleDashed, label: 'Confirmar staff' };
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

  const todaySchedules = useMemo(() => {
    const activeSchedules = filterSchedulesByModality(schedules, '');
    const columns = resolveScheduleGridColumns(activeSchedules);
    const grid = buildWeeklyScheduleGrid(activeSchedules, columns);
    return flattenTodaySchedules(grid, todayId);
  }, [schedules, todayId]);

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
    <section className="reception-section recepcao-today-lessons" aria-label="Aulas de hoje">
      <ReportSectionHeading
        title="Aulas de hoje"
        subtitle="Confirme professor e instrutor (ou marque que não houve aula)."
      />

      {loadingSchedules && !todaySchedules.length ? (
        <p className="text-muted text-small">Carregando aulas…</p>
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
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`recepcao-today-lessons__card recepcao-today-lessons__card--${badge.tone}`}
                  onClick={() => setActive({ schedule: item, slot })}
                >
                  <div className="recepcao-today-lessons__head">
                    <span className="recepcao-today-lessons__time">
                      {item.time_start}–{item.time_end}
                    </span>
                    <span className="recepcao-today-lessons__name">{item.name}</span>
                  </div>
                  <span className={`recepcao-today-lessons__badge recepcao-today-lessons__badge--${badge.tone}`}>
                    <Icon size={14} aria-hidden />
                    {badge.label}
                  </span>
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
        teamMembers={teamMembers}
        onSaved={handleSaved}
      />
    </section>
  );
}
