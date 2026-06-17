import { parseAutomationsConfig } from './useAutomations.js';
import { triggerImmediateAutomation } from './triggerImmediateAutomation.js';
import {
  buildPendingLeadPatch,
  buildReminderSendAtIso,
  buildWaitingDecisionSendAtIso,
  buildFollowupD1SendAtIso,
} from '../../lib/automationCore.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';

function resolveAutomationConfig(automationConfig, academyRaw) {
  if (automationConfig && typeof automationConfig === 'object') return automationConfig;
  return parseAutomationsConfig(academyRaw);
}

function emptyResult() {
  return { immediate: [], scheduled: [] };
}

/**
 * @param {object} ctx
 * @returns {Promise<{ immediate: object[]; scheduled: { key: string; sendAt: string }[] }>}
 */
export async function queueWaitingDecisionAutomation(ctx) {
  const result = emptyResult();
  const { lead, waOutbound, academyId, permissionContext, updateLead, getLead } = ctx;
  const automationConfig = resolveAutomationConfig(ctx.automationConfig, ctx.academyRaw);
  const cfg = automationConfig?.waiting_decision;
  if (!cfg?.active || !updateLead) return result;

  const leadId = String(lead?.id || '').trim();
  if (!leadId) return result;

  const delay = Number(cfg.delayMinutes || 0);
  if (delay <= 0) {
    const out = await triggerImmediateAutomation('waiting_decision', {
      lead,
      academyId,
      waOutbound,
      academyRaw: ctx.academyRaw,
      permissionContext,
    }).catch(() => ({ status: 'failed', automationKey: 'waiting_decision', reason: 'send_failed' }));
    result.immediate.push(out);
    return result;
  }

  const sendAt = buildWaitingDecisionSendAtIso(delay);
  if (!sendAt) return result;

  const refreshed = typeof getLead === 'function' ? getLead() : null;
  const base = refreshed && typeof refreshed === 'object' ? refreshed : lead;
  const patch = buildPendingLeadPatch(base, 'waiting_decision', sendAt);
  await updateLead(leadId, patch);
  result.scheduled.push({ key: 'waiting_decision', sendAt });
  return result;
}

export async function afterExperimentalScheduled(ctx) {
  const result = emptyResult();
  const {
    lead,
    ymd,
    time,
    academyId,
    waOutbound,
    academyRaw,
    automationConfig,
    permissionContext,
    updateLead,
    getLead,
  } = ctx;

  const cfgMap = resolveAutomationConfig(automationConfig, academyRaw);
  const leadId = String(lead?.id || '').trim();
  const mergedLead = {
    ...lead,
    id: leadId || lead?.id,
    scheduledDate: ymd,
    scheduledTime: time,
  };

  const confirmOut = await triggerImmediateAutomation('schedule_confirm', {
    lead: mergedLead,
    academyId,
    waOutbound,
    academyRaw,
    permissionContext,
  }).catch(() => ({ status: 'failed', automationKey: 'schedule_confirm', reason: 'send_failed' }));
  result.immediate.push(confirmOut);

  const reminderCfg = cfgMap?.schedule_reminder;
  if (!reminderCfg?.active || !updateLead || !leadId) return result;

  const delay = Number(reminderCfg.delayMinutes ?? 0);
  const sendAt =
    delay > 0
      ? buildReminderSendAtIso(ymd, time, delay)
      : buildReminderSendAtIso(ymd, time, 0);
  if (!sendAt) return result;

  const refreshed = typeof getLead === 'function' ? getLead() : null;
  const base = refreshed && typeof refreshed === 'object' ? refreshed : mergedLead;
  const patch = buildPendingLeadPatch(base, 'schedule_reminder', sendAt);
  try {
    await updateLead(leadId, patch);
    result.scheduled.push({ key: 'schedule_reminder', sendAt });
  } catch (e) {
    console.warn('[afterExperimentalScheduled] schedule_reminder patch failed:', e?.message || e);
  }
  return result;
}

export async function queueFollowupD1Automation(ctx) {
  const result = emptyResult();
  const { lead, updateLead, getLead } = ctx;
  const automationConfig = resolveAutomationConfig(ctx.automationConfig, ctx.academyRaw);
  const cfg = automationConfig?.followup_d1_attended;
  if (!cfg?.active || !updateLead) return result;

  const leadId = String(lead?.id || '').trim();
  const ymd = String(lead?.scheduledDate || '').slice(0, 10);
  const sendAt = buildFollowupD1SendAtIso(ymd);
  if (!leadId || !sendAt) return result;

  const refreshed = typeof getLead === 'function' ? getLead() : null;
  const base = refreshed && typeof refreshed === 'object' ? refreshed : lead;
  const patch = buildPendingLeadPatch(base, 'followup_d1_attended', sendAt);
  await updateLead(leadId, patch);
  result.scheduled.push({ key: 'followup_d1_attended', sendAt });
  return result;
}

export async function afterPresenceConfirmed(ctx) {
  const result = emptyResult();
  const { lead, academyId, waOutbound, academyRaw, permissionContext } = ctx;

  const presenceOut = await triggerImmediateAutomation('presence_confirmed', {
    lead,
    academyId,
    waOutbound,
    academyRaw,
    permissionContext,
  }).catch(() => ({ status: 'failed', automationKey: 'presence_confirmed', reason: 'send_failed' }));
  result.immediate.push(presenceOut);

  const d1 = await queueFollowupD1Automation(ctx);
  result.scheduled.push(...(d1.scheduled || []));

  const queued = await queueWaitingDecisionAutomation(ctx);
  result.immediate.push(...(queued.immediate || []));
  result.scheduled.push(...(queued.scheduled || []));
  return result;
}

export async function afterMissed(ctx) {
  const result = emptyResult();
  const { lead, academyId, waOutbound, academyRaw, permissionContext } = ctx;

  const out = await triggerImmediateAutomation('missed', {
    lead,
    academyId,
    waOutbound,
    academyRaw,
    permissionContext,
  }).catch(() => ({ status: 'failed', automationKey: 'missed', reason: 'send_failed' }));
  result.immediate.push(out);
  return result;
}

export async function afterMovedToPipelineStage(ctx) {
  const result = emptyResult();
  const toStage = String(ctx.toStage || '').trim();
  if (toStage === PIPELINE_WAITING_DECISION_STAGE) {
    const queued = await queueWaitingDecisionAutomation(ctx);
    result.immediate.push(...(queued.immediate || []));
    result.scheduled.push(...(queued.scheduled || []));
  }
  return result;
}

export function buildWaOutboundFromHooks({ academyName, zapsterInstanceId, templates }) {
  return {
    name: academyName || '',
    zapster_instance_id: zapsterInstanceId || '',
    templates: templates || {},
  };
}
