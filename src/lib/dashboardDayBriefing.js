import { LEAD_STATUS } from '../store/useLeadStore';
import { enrollmentDateYmd } from './studentEnrollmentDate.js';
import { getCivilWeekBounds } from '../components/AgendaCalendarWeek.jsx';
import { getFollowupKind } from './followupState.js';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** @typedef {'morning' | 'afternoon' | 'evening'} DayPeriod */

/** @returns {DayPeriod} */
export function getTimeOfDayPeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function formatTodayHeroDate(date = new Date()) {
  const label = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function periodGreeting(period) {
  if (period === 'morning') return 'Bom dia';
  if (period === 'afternoon') return 'Boa tarde';
  return 'Boa noite';
}

export function buildGreetingLine(firstName, date = new Date()) {
  const name = String(firstName || '').trim();
  const greeting = periodGreeting(getTimeOfDayPeriod(date));
  if (name) return `${greeting}, ${name}`;
  return greeting;
}

/** Data em destaque no hero (sem saudação). */
export function buildHeroDateLine(date = new Date()) {
  return formatTodayHeroDate(date);
}

/** Nome da academia como linha secundária no hero. */
export function buildHeroAcademyLine(academyName) {
  return String(academyName || '').trim();
}

function parseLeadDateTime(lead, dayStart) {
  const raw = String(lead?.scheduledTime || '').trim();
  if (!raw || !/^\d{2}:\d{2}$/.test(raw)) return null;
  const [h, mi] = raw.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  const d = new Date(dayStart);
  d.setHours(h, mi, 0, 0);
  return d;
}

function sortLeadsByTime(leads) {
  return [...(leads || [])].sort((a, b) =>
    String(a?.scheduledTime || '99:99').localeCompare(String(b?.scheduledTime || '99:99'))
  );
}

function firstTrialTimeLabel(leads) {
  const sorted = sortLeadsByTime(leads);
  for (const lead of sorted) {
    const t = String(lead?.scheduledTime || '').trim();
    if (t && /^\d{2}:\d{2}$/.test(t)) return t;
  }
  return null;
}

/** Retornos abertos que ainda precisam de contato (sem WhatsApp/resposta no ciclo). */
export function followUpsNeedingContact(followUps) {
  return (followUps || []).filter((lead) => !lead?.hasContactInCycle);
}

/**
 * @param {{
 *   todayScheduled: object[];
 *   followUps: object[];
 *   pendingTasks: object[];
 *   trialShort: string;
 *   weeklyEnrollments?: number;
 *   omitTodaySchedule?: boolean;
 * }} ctx
 */
export function buildDaySummaryLine(ctx) {
  const trial = String(ctx.trialShort || 'aula experimental').toLowerCase();
  const pendingToday = ctx.omitTodaySchedule ? [] : ctx.todayScheduled || [];
  const agendaToday = ctx.omitTodaySchedule ? [] : ctx.todayOnAgenda || pendingToday;
  const pendingCount = pendingToday.length;
  const agendaCount = agendaToday.length;
  const followCount = followUpsNeedingContact(ctx.followUps).length;
  const taskCount = ctx.pendingTasks?.length || 0;
  const weekly = Number(ctx.weeklyEnrollments) || 0;

  const parts = [];
  const trialNoun = (count) =>
    count === 1 ? trial : trial.endsWith('s') ? trial : `${trial}s`;

  if (pendingCount > 0) {
    const firstTime = firstTrialTimeLabel(pendingToday);
    const noun = trialNoun(pendingCount);
    if (firstTime) {
      parts.push(`${pendingCount} ${noun} hoje. A primeira é às ${firstTime}.`);
    } else {
      parts.push(`${pendingCount} ${noun} hoje.`);
    }
  } else if (agendaCount > 0) {
    const noun = trialNoun(agendaCount);
    parts.push(
      agendaCount === 1 ? `Hoje teve 1 ${noun}.` : `Hoje foram ${agendaCount} ${noun}.`
    );
    if (followCount > 0) {
      parts.push(
        `Vale retomar ${followCount} retorno${followCount === 1 ? '' : 's'} pendente${followCount === 1 ? '' : 's'}.`
      );
    }
  } else if (followCount > 0) {
    parts.push(
      `Nenhuma ${trial} hoje. Vale retomar ${followCount} retorno${followCount === 1 ? '' : 's'} pendente${followCount === 1 ? '' : 's'}.`
    );
  } else if (taskCount > 0) {
    parts.push(
      `${taskCount} tarefa${taskCount === 1 ? '' : 's'} para hoje. Comece pela que vence mais cedo.`
    );
  } else {
    parts.push('Agenda e retornos em dia. Bom momento para revisar a semana.');
  }

  if (weekly > 0 && (pendingCount > 0 || agendaCount > 0)) {
    parts.push(
      weekly === 1
        ? '1 matrícula esta semana. Continue assim.'
        : `${weekly} matrículas esta semana. Continue assim.`
    );
  }

  return parts.join(' ');
}

/** @param {object} lead @param {number} days */
function followupVisitLine(lead, days) {
  const kind = getFollowupKind(lead);
  if (days === 1) {
    return kind === 'missed' ? 'faltou ontem' : 'veio ontem';
  }
  const daysPart = `${days} dia${days === 1 ? '' : 's'}`;
  return kind === 'missed' ? `faltou há ${daysPart}` : `veio há ${daysPart}`;
}

/** @param {object} lead */
function buildUrgentFollowupPriorityMessage(lead) {
  const name = String(lead.name || 'Interessado').trim();
  const days = lead.daysAgo ?? 0;
  const daysLabel = days === 1 ? '1 dia' : `${days} dias`;

  if (lead.temperature === 'critical') {
    return `${name} está há ${daysLabel} sem retorno desde a aula. Vale retomar com urgência.`;
  }

  const visit = followupVisitLine(lead, days);
  return `${name} ${visit}. Ainda sem retorno. Vale uma mensagem.`;
}

/**
 * @typedef {{
 *   type: 'upcoming_class' | 'urgent_followup' | 'fallback';
 *   message: string;
 *   scrollTarget?: 'today' | 'follow-ups';
 *   highlightKpi?: 'today';
 *   leadId?: string;
 *   studentId?: string;
 * }} DayPriority
 */

/**
 * @param {{
 *   now?: Date;
 *   todayScheduled: object[];
 *   followUps: object[];
 *   todayBirthdays: object[];
 *   vertical?: string;
 *   daySummaryLine?: string;
 * }} ctx
 * @returns {DayPriority}
 */
export function getDayPriority(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const horizon = now.getTime() + TWO_HOURS_MS;

  const pendingToday = (ctx.todayScheduled || []).filter((lead) => {
    const status = String(lead?.status || '').trim();
    return status !== LEAD_STATUS.COMPLETED && status !== LEAD_STATUS.MISSED;
  });

  let nearest = null;
  let nearestMs = Infinity;

  for (const lead of pendingToday) {
    const at = parseLeadDateTime(lead, dayStart);
    if (!at) continue;
    const ms = at.getTime();
    if (ms >= now.getTime() && ms <= horizon && ms < nearestMs) {
      nearest = lead;
      nearestMs = ms;
    }
  }

  if (nearest) {
    const time = String(nearest.scheduledTime || '').trim();
    const name = String(nearest.name || 'Interessado').trim();
    return {
      type: 'upcoming_class',
      message: `${name} chega às ${time}. Confirme a recepção.`,
      scrollTarget: 'today',
      highlightKpi: 'today',
      leadId: String(nearest.id || '').trim() || undefined,
    };
  }

  const responded = [...(ctx.followUps || [])]
    .filter((l) => l.hasContactInCycle && !l.doneForCurrentClass)
    .sort((a, b) => (a.daysAgo ?? 0) - (b.daysAgo ?? 0));

  if (responded.length > 0) {
    const lead = responded[0];
    const name = String(lead.name || 'Interessado').trim();
    return {
      type: 'urgent_followup',
      message: `${name} já respondeu no WhatsApp. Acompanhe o próximo passo no retorno.`,
      scrollTarget: 'follow-ups',
      leadId: String(lead.id || '').trim() || undefined,
    };
  }

  const cooling = [...(ctx.followUps || [])]
    .filter(
      (l) =>
        !l.hasContactInCycle &&
        (l.temperature === 'cooling' || l.temperature === 'critical')
    )
    .sort((a, b) => {
      const order = { critical: 0, cooling: 1 };
      const ta = order[a.temperature] ?? 2;
      const tb = order[b.temperature] ?? 2;
      if (ta !== tb) return ta - tb;
      return (b.daysAgo ?? 0) - (a.daysAgo ?? 0);
    });

  if (cooling.length > 0) {
    const lead = cooling[0];
    return {
      type: 'urgent_followup',
      message: buildUrgentFollowupPriorityMessage(lead),
      scrollTarget: 'follow-ups',
      leadId: String(lead.id || '').trim() || undefined,
    };
  }

  const followCount = (ctx.followUps || []).length;
  const message =
    followCount > 0
      ? 'Priorize quem está há mais tempo aguardando retorno.'
      : 'Revise a agenda da semana e prepare os próximos contatos.';
  return {
    type: 'fallback',
    message,
    scrollTarget: followCount > 0 ? 'follow-ups' : undefined,
  };
}

/** Conta matrículas na semana civil (ingresso → converted_at). */
export function countWeeklyEnrollments(students) {
  const { startMs, endMs } = getCivilWeekBounds(0, true);
  let count = 0;
  for (const student of students || []) {
    const ymd = enrollmentDateYmd(student);
    if (!ymd) continue;
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0).getTime();
    if (t >= startMs && t <= endMs) count += 1;
  }
  return count;
}
