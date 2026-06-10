import { LEAD_STATUS } from '../store/useLeadStore';
import { enrollmentIngressYmd } from './studentEnrollmentDate.js';
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

/**
 * @param {{
 *   todayScheduled: object[];
 *   followUps: object[];
 *   pendingTasks: object[];
 *   trialShort: string;
 *   weeklyEnrollments?: number;
 * }} ctx
 */
export function buildDaySummaryLine(ctx) {
  const trial = String(ctx.trialShort || 'aula experimental').toLowerCase();
  const todayCount = ctx.todayScheduled?.length || 0;
  const followCount = ctx.followUps?.length || 0;
  const taskCount = ctx.pendingTasks?.length || 0;
  const weekly = Number(ctx.weeklyEnrollments) || 0;

  const parts = [];

  if (todayCount > 0) {
    const firstTime = firstTrialTimeLabel(ctx.todayScheduled);
    const noun =
      todayCount === 1 ? trial : trial.endsWith('s') ? trial : `${trial}s`;
    if (firstTime) {
      parts.push(
        `${todayCount} ${noun} hoje — a primeira é às ${firstTime}.`
      );
    } else {
      parts.push(`${todayCount} ${noun} hoje.`);
    }
  } else if (followCount > 0) {
    parts.push(
      `Nenhuma ${trial} hoje. Vale retomar ${followCount} retorno${followCount === 1 ? '' : 's'} pendente${followCount === 1 ? '' : 's'}.`
    );
  } else if (taskCount > 0) {
    parts.push(
      `${taskCount} tarefa${taskCount === 1 ? '' : 's'} para hoje — comece pela que vence primeiro.`
    );
  } else {
    parts.push('Agenda e retornos em dia. Bom momento para revisar a semana.');
  }

  if (weekly > 0 && todayCount > 0) {
    parts.push(
      weekly === 1
        ? '1 matrícula esta semana — continue assim.'
        : `${weekly} matrículas esta semana — continue assim.`
    );
  }

  return parts.join(' ');
}

/**
 * @typedef {{
 *   type: 'upcoming_class' | 'urgent_followup' | 'birthday' | 'fallback';
 *   message: string;
 *   scrollTarget?: 'today' | 'follow-ups' | 'birthdays';
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
      message: `${name} chega às ${time} — confirme a recepção.`,
      scrollTarget: 'today',
      highlightKpi: 'today',
      leadId: String(nearest.id || '').trim() || undefined,
    };
  }

  const cooling = [...(ctx.followUps || [])]
    .filter((l) => l.temperature === 'cooling' || l.temperature === 'critical')
    .sort((a, b) => {
      const order = { critical: 0, cooling: 1 };
      const ta = order[a.temperature] ?? 2;
      const tb = order[b.temperature] ?? 2;
      if (ta !== tb) return ta - tb;
      return (b.daysAgo ?? 0) - (a.daysAgo ?? 0);
    });

  if (cooling.length > 0) {
    const lead = cooling[0];
    const name = String(lead.name || 'Interessado').trim();
    const days = lead.daysAgo ?? 0;
    const verb = lead.temperature === 'critical' ? 'está crítico' : 'está esfriando';
    return {
      type: 'urgent_followup',
      message: `${name} ${verb} — ${days} dia${days === 1 ? '' : 's'} desde a aula. Vale uma mensagem.`,
      scrollTarget: 'follow-ups',
      leadId: String(lead.id || '').trim() || undefined,
    };
  }

  const birthdays = ctx.todayBirthdays || [];
  if (birthdays.length > 0) {
    const student = birthdays[0];
    const name = String(student.name || 'Aluno').trim();
    const turma = String(student.turma || student.className || '').trim();
    const turmaPart = turma ? ` (${turma})` : '';
    if (birthdays.length === 1) {
      return {
        type: 'birthday',
        message: `Hoje é aniversário de ${name}${turmaPart}.`,
        scrollTarget: 'birthdays',
        studentId: String(student.id || '').trim() || undefined,
      };
    }
    return {
      type: 'birthday',
      message: `${birthdays.length} aniversariantes hoje — comece por ${name}${turmaPart}.`,
      scrollTarget: 'birthdays',
      studentId: String(student.id || '').trim() || undefined,
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

/** Conta matrículas (ingresso) na semana civil atual. */
export function countWeeklyEnrollments(students, now = new Date()) {
  const { startMs, endMs } = getCivilWeekBounds(0, true);
  let count = 0;
  for (const student of students || []) {
    const ymd = enrollmentIngressYmd(student);
    if (!ymd) continue;
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0).getTime();
    if (t >= startMs && t <= endMs) count += 1;
  }
  return count;
}
