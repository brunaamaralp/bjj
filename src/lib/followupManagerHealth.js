import { LEAD_STATUS } from './leadStatus.js';
import { getCivilWeekBounds } from '../components/AgendaCalendarWeek.jsx';
import { getFollowupClassDate, hasContactInCycle } from './followupState.js';

function ymdFromDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * @param {object[]} leads
 * @param {object} ctx — mesmo ctx de followupState
 */
export function computeFollowupHealthSummary(leads, ctx) {
  const active = (leads || []).filter(
    (l) =>
      String(l?.origin || '').trim() !== 'Planilha' &&
      (l.status === LEAD_STATUS.COMPLETED || l.status === LEAD_STATUS.MISSED)
  );

  let on_track = 0;
  let cooling = 0;
  let critical = 0;
  const coolingLeads = [];

  for (const lead of active) {
    const temp = lead.temperature;
    if (temp === 'critical') critical += 1;
    else if (temp === 'cooling') cooling += 1;
    else on_track += 1;
    if (temp === 'cooling' || temp === 'critical') {
      coolingLeads.push(lead);
    }
  }

  const tempOrder = { critical: 0, cooling: 1 };
  coolingLeads.sort((a, b) => {
    const ta = tempOrder[a.temperature] ?? 2;
    const tb = tempOrder[b.temperature] ?? 2;
    if (ta !== tb) return ta - tb;
    return (b.daysAgo ?? 0) - (a.daysAgo ?? 0);
  });

  const { startMs, endMs } = getCivilWeekBounds(0);
  const weekStart = ymdFromDate(new Date(startMs));
  const weekEnd = ymdFromDate(new Date(endMs));

  let attendedInWeek = 0;
  let contactedD1 = 0;

  for (const lead of active) {
    if (lead.status !== LEAD_STATUS.COMPLETED) continue;
    const attendedYmd = String(lead.attendedAt || lead.scheduledDate || '').slice(0, 10);
    if (!attendedYmd || attendedYmd < weekStart || attendedYmd > weekEnd) continue;
    attendedInWeek += 1;

    const classDate = getFollowupClassDate(lead);
    const deadline = new Date(classDate);
    deadline.setDate(deadline.getDate() + 1);
    deadline.setHours(23, 59, 59, 999);

    const doneAt = ctx.followupDoneByLead?.[String(lead.id || '').trim()];
    const contactAt = ctx.followupContactByLead?.[String(lead.id || '').trim()];
    const contactMs = Math.max(
      doneAt ? new Date(doneAt).getTime() : 0,
      contactAt ? new Date(contactAt).getTime() : 0
    );

    if (contactMs > 0 && contactMs <= deadline.getTime()) contactedD1 += 1;
    else if (hasContactInCycle(lead, ctx) && contactMs <= deadline.getTime()) contactedD1 += 1;
  }

  const d1RatePercent = attendedInWeek > 0 ? Math.round((contactedD1 / attendedInWeek) * 100) : null;

  return {
    on_track,
    cooling,
    critical,
    coolingLeads: coolingLeads.slice(0, 10),
    attendedInWeek,
    contactedD1,
    d1RatePercent,
  };
}
