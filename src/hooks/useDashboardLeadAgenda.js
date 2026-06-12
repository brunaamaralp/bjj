import { useMemo } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import {
  isLeadExperimentalOnDate,
  isLeadScheduledForExperimental,
  isLeadVisibleOnExperimentalAgenda,
} from '../lib/leadStageRules.js';
import { filterLeadsInCivilWeek } from '../components/AgendaCalendarWeek.jsx';

function leadToDateTime(lead) {
  const base = lead.scheduledDate || lead.createdAt || '';
  if (!base) return new Date(8640000000000000);
  const [y, m, d] = base.split('T')[0].split('-').map(Number);
  let hh = 23;
  let mm = 59;
  if (lead.scheduledTime && /^\d{2}:\d{2}$/.test(lead.scheduledTime)) {
    const [h, mi] = lead.scheduledTime.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(mi)) {
      hh = h;
      mm = mi;
    }
  }
  return new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
}

/**
 * Agenda semanal e agendamentos do dia — subscribe isolado em `leads[]`.
 */
export function useDashboardLeadAgenda() {
  const leads = useLeadStore((s) => s.leads);

  const agendaWeekLeads = useMemo(
    () =>
      (leads || [])
        .filter(isLeadVisibleOnExperimentalAgenda)
        .sort((a, b) => leadToDateTime(a) - leadToDateTime(b)),
    [leads]
  );

  const allScheduled = useMemo(
    () => agendaWeekLeads.filter(isLeadScheduledForExperimental),
    [agendaWeekLeads]
  );

  const todayOnAgenda = useMemo(() => {
    const today = new Date();
    return agendaWeekLeads.filter((lead) => isLeadExperimentalOnDate(lead, today));
  }, [agendaWeekLeads]);

  /** Experimentais ainda aguardando presença (status Agendado). */
  const todayScheduled = useMemo(
    () => todayOnAgenda.filter(isLeadScheduledForExperimental),
    [todayOnAgenda]
  );

  const scheduledInVisibleWeekCount = (weekOffset) =>
    filterLeadsInCivilWeek(agendaWeekLeads, weekOffset).length;

  return {
    agendaWeekLeads,
    allScheduled,
    todayOnAgenda,
    todayScheduled,
    scheduledInVisibleWeekCount,
  };
}
