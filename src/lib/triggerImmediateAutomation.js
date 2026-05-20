import { sendWhatsappTemplateOutbound } from './outboundWhatsappTemplate';
import { parseAutomationsConfig } from './useAutomations';

export async function triggerImmediateAutomation(
  key,
  { lead, academyId, waOutbound, academyRaw, permissionContext, createdBy }
) {
  const config = parseAutomationsConfig(academyRaw)?.[key];
  if (!config?.active || Number(config.delayMinutes || 0) > 0) return;
  if (!lead?.phone) return;

  const result = await sendWhatsappTemplateOutbound({
    lead,
    academyId,
    academyName: waOutbound?.name,
    templateKey: config.templateKey,
    automationKey: key,
    templatesMap: waOutbound?.templates || {},
    zapsterInstanceId: waOutbound?.zapster_instance_id,
    permissionContext,
    createdBy: createdBy || 'automation',
  }).catch(console.error);

  return result;
}
