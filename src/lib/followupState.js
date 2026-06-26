import { LEAD_STATUS } from './leadStatus.js';
import { isActiveStudent } from './studentStatus.js';
import { WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import {
  computeFallbackTemperature,
  computePlaybookTemperature,
  FOLLOWUP_TEMPERATURE_ORDER,
} from './followupTemperature.js';
import { readFollowupPlaybook } from './followupPlaybookDefaults.js';
import { inboundCountsAsContact, resolveInboundAfterForLead } from './followupInbound.js';

export const FOLLOWUP_AGENDA_MAX_DAYS = 7;

/**
 * @param {object} lead
 * @returns {Date}
 */
export function getFollowupClassDate(lead) {
  if (lead?.scheduledDate) return new Date(`${lead.scheduledDate}T00:00:00`);
  return new Date(lead?.createdAt || Date.now());
}

/**
 * @param {object} lead
 * @param {Date} [now]
 */
export function getFollowupDaysAgo(lead, now = new Date()) {
  const classDay = getFollowupClassDate(lead);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  classDay.setHours(0, 0, 0, 0);
  return Math.floor((today - classDay) / 86400000);
}

/**
 * @param {object} lead
 * @returns {'attended' | 'missed' | null}
 */
export function getFollowupKind(lead) {
  const status = String(lead?.status || '').trim();
  if (status === LEAD_STATUS.COMPLETED) return 'attended';
  if (status === LEAD_STATUS.MISSED) return 'missed';
  return null;
}

function eventMatchesCycle(atIso, payload, scheduledDate, classMs) {
  const atMs = new Date(atIso).getTime();
  if (!Number.isFinite(atMs) || atMs < classMs) return false;
  const eventDate = String(payload?.scheduledDate || '').slice(0, 10);
  if (eventDate && scheduledDate && eventDate !== scheduledDate) return false;
  return true;
}

/**
 * @param {object} lead
 * @param {object} ctx
 * @param {Record<string, string>} [ctx.followupDoneByLead]
 * @param {Record<string, string>} [ctx.followupContactByLead]
 * @param {Record<string, string>} [ctx.followupSnoozeUntilByLead]
 * @param {Record<string, string>} [ctx.inboundAfterByLead]
 * @param {Record<string, string>} [ctx.inboundAfterByPhone]
 * @param {import('./followupPlaybookDefaults.js').FollowupPlaybook} [ctx.playbook]
 * @param {Date} [ctx.now]
 */
export function hasContactInCycle(lead, ctx = {}) {
  const leadId = String(lead?.id || '').trim();
  const scheduledDate = String(lead?.scheduledDate || '').slice(0, 10);
  const classMs = getFollowupClassDate(lead).getTime();

  const doneAt = ctx.followupDoneByLead?.[leadId];
  if (doneAt && eventMatchesCycle(doneAt, {}, scheduledDate, classMs)) return true;

  const contactAt = ctx.followupContactByLead?.[leadId];
  if (contactAt && eventMatchesCycle(contactAt, { scheduledDate }, scheduledDate, classMs)) return true;

  const inboundAt = resolveInboundAfterForLead(lead, ctx);
  if (inboundAt && inboundCountsAsContact(inboundAt, classMs)) return true;

  const waAt = String(lead?.lastWhatsappActivityAt || '').trim();
  if (waAt && inboundCountsAsContact(waAt, classMs)) return true;

  return false;
}

/**
 * @param {import('./followupPlaybookDefaults.js').FollowupPlaybookStep[]} steps
 * @param {number} daysAgo
 * @param {boolean} hasContact
 */
export function resolvePlaybookSteps(steps, daysAgo, hasContact) {
  const sorted = [...(steps || [])].sort((a, b) => a.offset_days - b.offset_days);
  let nextStep = null;
  let dueStep = null;

  for (const step of sorted) {
    if (daysAgo < step.offset_days) {
      if (!nextStep) nextStep = step;
      continue;
    }
    dueStep = step;
    const needsAction = stepNeedsAction(step, daysAgo, hasContact);
    if (needsAction) {
      nextStep = step;
      break;
    }
  }

  if (!nextStep) {
    nextStep = sorted.find((s) => s.offset_days > daysAgo) || null;
  }

  return { dueStep, nextStep };
}

function stepNeedsAction(step, daysAgo, hasContact) {
  if (daysAgo < step.offset_days) return false;
  if (step.action_type === 'task') return !hasContact;
  if (step.action_type === 'whatsapp_template') {
    if (!step.skip_if_contacted) return !hasContact || daysAgo === step.offset_days;
    return !hasContact;
  }
  return false;
}

/**
 * @param {object} lead
 * @param {object} ctx
 */
export function computeFollowupState(lead, ctx = {}) {
  const kind = getFollowupKind(lead);
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const daysAgo = getFollowupDaysAgo(lead, now);
  const scheduledDate = String(lead?.scheduledDate || '').slice(0, 10);
  const leadId = String(lead?.id || '').trim();
  const classDate = getFollowupClassDate(lead);
  const classMs = classDate.getTime();

  const snoozedUntil = String(ctx.followupSnoozeUntilByLead?.[leadId] || '').slice(0, 10);
  const todayYmd = now.toISOString().slice(0, 10);
  const isSnoozed = snoozedUntil && snoozedUntil > todayYmd;

  const doneAtIso = String(ctx.followupDoneByLead?.[leadId] || '').trim();
  const doneAtMs = doneAtIso ? new Date(doneAtIso).getTime() : 0;
  const doneForCurrentClass = Number.isFinite(doneAtMs) && doneAtMs > 0 && doneAtMs >= classMs;

  const contact = hasContactInCycle(lead, ctx);
  const playbook = ctx.playbook || readFollowupPlaybook(null);
  const track = kind === 'missed' ? playbook.missed : playbook.attended;
  const { dueStep, nextStep } = kind && playbook.enabled !== false
    ? resolvePlaybookSteps(track, daysAgo, contact)
    : { dueStep: null, nextStep: null };

  const temperature =
    kind && playbook.enabled !== false
      ? computePlaybookTemperature(daysAgo, contact, dueStep || nextStep)
      : kind
        ? computeFallbackTemperature(lead, kind, daysAgo, contact)
        : 'on_track';

  return {
    cycleKey: `${leadId}:${scheduledDate}`,
    classDate,
    daysAgo,
    kind,
    temperature,
    hasContactInCycle: contact,
    currentStep: dueStep,
    nextStep,
    doneForCurrentClass,
    snoozedUntil: isSnoozed ? snoozedUntil : null,
    isSnoozed,
  };
}

export function describePlaybookStep(step) {
  if (!step) return '';
  if (step.action_type === 'whatsapp_template') {
    const label = WHATSAPP_TEMPLATE_LABELS[step.template_key] || step.template_key;
    return `Enviar ${label}`;
  }
  if (step.action_type === 'task') return String(step.task_title || 'Tarefa de retorno');
  return 'Retorno manual';
}

/**
 * @param {object[]} leads
 * @param {object} ctx
 */
export function enrichFollowUpLeads(leads, ctx) {
  return (leads || []).map((lead) => {
    const state = computeFollowupState(lead, ctx);
    return {
      ...lead,
      daysAgo: state.daysAgo,
      classDate: state.classDate,
      doneForCurrentClass: state.doneForCurrentClass,
      temperature: state.temperature,
      hasContactInCycle: state.hasContactInCycle,
      nextStep: state.nextStep,
      nextActionLabel: describePlaybookStep(state.nextStep),
      isSnoozed: state.isSnoozed,
      snoozedUntil: state.snoozedUntil,
    };
  });
}

export function sortFollowupsByTemperature(a, b) {
  const ta = FOLLOWUP_TEMPERATURE_ORDER[a.temperature] ?? 9;
  const tb = FOLLOWUP_TEMPERATURE_ORDER[b.temperature] ?? 9;
  if (ta !== tb) return ta - tb;
  return (b.daysAgo ?? 0) - (a.daysAgo ?? 0);
}

export function groupFollowUpsByTemperature(followUps) {
  const critical = followUps.filter((l) => l.temperature === 'critical');
  const cooling = followUps.filter((l) => l.temperature === 'cooling');
  const onTrack = followUps.filter((l) => l.temperature === 'on_track');
  const groups = [];

  if (critical.length > 0) {
    groups.push({
      key: 'critical',
      label: 'Crítico',
      hint: '3+ dias sem retorno adequado',
      items: critical,
      className: 'fu-group--critical',
    });
  }
  if (cooling.length > 0) {
    groups.push({
      key: 'cooling',
      label: 'Esfriando',
      hint: 'Vale retomar hoje',
      items: cooling,
      className: 'fu-group--cooling',
    });
  }
  if (onTrack.length > 0) {
    groups.push({
      key: 'on_track',
      label: 'Em dia',
      hint: 'Já retornou ou ainda no prazo após a aula',
      items: onTrack,
      className: 'fu-group--on-track',
    });
  }
  return groups;
}

export function countFollowupsByTemperature(followUps) {
  let on_track = 0;
  let cooling = 0;
  let critical = 0;
  for (const l of followUps || []) {
    if (l.temperature === 'critical') critical += 1;
    else if (l.temperature === 'cooling') cooling += 1;
    else on_track += 1;
  }
  return { on_track, cooling, critical };
}

/**
 * IDs de alunos ativos — leads com o mesmo $id já matriculados saem do follow-up.
 * @param {object[]} students
 * @returns {Set<string>}
 */
export function buildActiveStudentIdSet(students) {
  const set = new Set();
  for (const student of students || []) {
    if (!isActiveStudent(student)) continue;
    const id = String(student?.id || student?.$id || '').trim();
    if (id) set.add(id);
  }
  return set;
}

/**
 * @param {object} lead
 * @param {{ enrolledStudentIds?: Set<string> }} [ctx]
 */
export function isFollowUpLead(lead, ctx = {}) {
  if (String(lead?.origin || '').trim() === 'Planilha') return false;
  const status = String(lead?.status || '').trim();
  if (status === LEAD_STATUS.CONVERTED) return false;
  if (String(lead?.contact_type || '').trim() === 'student') return false;
  const leadId = String(lead?.id || '').trim();
  if (leadId && ctx.enrolledStudentIds?.has?.(leadId)) return false;
  return getFollowupKind(lead) !== null;
}

/**
 * @param {object[]} leads
 * @param {{ enrolledStudentIds?: Set<string> }} [ctx]
 */
export function filterFollowupLeadCandidates(leads, ctx = {}) {
  return (leads || []).filter((lead) => isFollowUpLead(lead, ctx));
}
