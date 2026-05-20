import { addLeadEventServer } from './leadEvents.js';

/**
 * Auditoria de envio via template WhatsApp (automação, cron, manual).
 */
export async function recordWhatsappTemplateSent({
  academyId,
  leadId,
  templateKey,
  automationKey = '',
  sentAt = new Date().toISOString(),
  createdBy = 'system',
}) {
  const aid = String(academyId || '').trim();
  const lid = String(leadId || '').trim();
  const tk = String(templateKey || '').trim();
  if (!aid || !lid || !tk) return null;

  return addLeadEventServer({
    academyId: aid,
    leadId: lid,
    type: 'whatsapp_template_sent',
    text: tk,
    at: sentAt,
    createdBy: String(createdBy || 'system').slice(0, 50),
    payloadJson: {
      templateKey: tk,
      automationKey: String(automationKey || '').trim() || null,
      leadId: lid,
      sentAt,
    },
  });
}
