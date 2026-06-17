import { LEAD_STATUS } from '../store/useLeadStore';
import { enrollmentDateYmd } from './studentEnrollmentDate.js';
import { getCivilWeekBounds } from '../components/AgendaCalendarWeek.jsx';

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

/** Plural em português para rótulos de experimental/avaliação no hero. */
function pluralizeTrialNoun(phrase, count) {
  const lower = String(phrase || 'aula experimental').trim().toLowerCase();
  if (count === 1) return lower;

  const known = {
    'aula experimental': 'aulas experimentais',
    experimental: 'experimentais',
    avaliação: 'avaliações',
  };
  if (known[lower]) return known[lower];

  if (lower.endsWith('ão')) return `${lower.slice(0, -2)}ões`;
  if (lower.endsWith('al')) return `${lower.slice(0, -1)}is`;
  if (lower.endsWith('s')) return lower;
  return lower;
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
 *   trial?: string;
 *   trialShort?: string;
 *   weeklyEnrollments?: number;
 *   omitTodaySchedule?: boolean;
 * }} ctx
 */
export function buildDaySummaryLine(ctx) {
  const trial = String(ctx.trial || ctx.trialShort || 'aula experimental').toLowerCase();
  const pendingToday = ctx.omitTodaySchedule ? [] : ctx.todayScheduled || [];
  const agendaToday = ctx.omitTodaySchedule ? [] : ctx.todayOnAgenda || pendingToday;
  const pendingCount = pendingToday.length;
  const agendaCount = agendaToday.length;
  const followCount = followUpsNeedingContact(ctx.followUps).length;
  const taskCount = ctx.pendingTasks?.length || 0;
  const weekly = Number(ctx.weeklyEnrollments) || 0;

  const parts = [];
  const trialNoun = (count) => pluralizeTrialNoun(trial, count);

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

/**
 * @typedef {{
 *   type: 'upcoming_class' | 'fallback';
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
