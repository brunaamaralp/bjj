import { sendWhatsappTemplateOutbound } from './outboundWhatsappTemplate';
import { parseAutomationsConfig } from './useAutomations';

export async function triggerImmediateAutomation(
  key,
  { lead, academyId, waOutbound, academyRaw }
) {
  const config = parseAutomationsConfig(academyRaw)?.[key];
  if (!config?.active || Number(config.delayMinutes || 0) > 0) return;
  if (!lead?.phone) return;

  const result = await sendWhatsappTemplateOutbound({
    lead,
    academyId,
    academyName: waOutbound?.name,
    templateKey: config.templateKey,
    templatesMap: waOutbound?.templates || {},
    zapsterInstanceId: waOutbound?.zapster_instance_id,
  }).catch(console.error);

  return result;
}
