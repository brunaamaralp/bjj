import { sendWhatsappTemplateOutbound } from './outboundWhatsappTemplate';
import { parseAutomationsConfig } from '../../lib/automationCore.js';

/**
 * @returns {Promise<{ status: 'sent'|'skipped'|'failed'; automationKey: string; reason?: string; channel?: string }>}
 */
export async function triggerImmediateAutomation(
  key,
  { lead, academyId, waOutbound, academyRaw, permissionContext, createdBy }
) {
  const config = parseAutomationsConfig(academyRaw)?.[key];
  if (!config?.active) {
    return { status: 'skipped', automationKey: key, reason: 'inactive' };
  }
  if (Number(config.delayMinutes || 0) > 0) {
    return { status: 'skipped', automationKey: key, reason: 'delayed' };
  }
  if (!lead?.phone) {
    return { status: 'skipped', automationKey: key, reason: 'no_phone' };
  }

  const inst = String(waOutbound?.zapster_instance_id || '').trim();

  const result = await sendWhatsappTemplateOutbound({
    lead,
    academyId,
    academyName: waOutbound?.name,
    templateKey: config.templateKey,
    automationKey: key,
    templatesMap: waOutbound?.templates || {},
    zapsterInstanceId: inst,
    permissionContext,
    createdBy: createdBy || 'automation',
    suppressToasts: true,
  }).catch((e) => {
    console.error(e);
    return { ok: false, reason: 'send_failed' };
  });

  if (!result?.ok) {
    const reason = result?.reason || 'send_failed';
    return {
      status: reason === 'no_recent_interaction' ? 'skipped' : 'failed',
      automationKey: key,
      reason,
    };
  }
  return {
    status: 'sent',
    automationKey: key,
    channel: result.channel || 'api',
  };
}
