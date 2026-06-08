import { sendZapsterText } from './zapsterSend.js';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  applyWhatsappTemplatePlaceholders,
} from '../whatsappTemplateDefaults.js';
import { parseAutomationsConfig } from '../automationCore.js';
import { addLeadEventServer } from './leadEvents.js';
import { createInternalNotification } from './internalNotification.js';

function parseTemplatesOverride(academy) {
  try {
    const raw = academy?.whatsappTemplates;
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (p && typeof p === 'object' && !Array.isArray(p)) return p;
  } catch {
    void 0;
  }
  return {};
}

/**
 * Envia template de automação via Zapster (cron) e registra na timeline.
 * @returns {Promise<{ ok: boolean; skipped?: string }>}
 */
export async function sendAutomationTemplateCron({
  leadDoc,
  academy,
  automationKey,
  templateKey,
}) {
  const templates = { ...DEFAULT_WHATSAPP_TEMPLATES, ...parseTemplatesOverride(academy) };
  const templateRaw = String(templates[templateKey] || '').trim();
  const phone = String(leadDoc?.phone || '').replace(/\D/g, '');
  const instanceId = String(academy?.zapster_instance_id || academy?.zapsterInstanceId || '').trim();
  const academyId = String(leadDoc?.academyId || academy?.$id || '').trim();
  const leadId = String(leadDoc?.$id || '').trim();

  if (!templateRaw) return { ok: false, skipped: 'empty_template' };
  if (!phone) return { ok: false, skipped: 'no_phone' };
  if (!instanceId) return { ok: false, skipped: 'no_zapster' };

  const message = applyWhatsappTemplatePlaceholders(templateRaw, {
    lead: {
      name: leadDoc.name,
      scheduledDate: leadDoc.scheduledDate,
      scheduledTime: leadDoc.scheduledTime,
    },
    academyName: String(academy?.name || '').trim(),
  });

  const out = await sendZapsterText({ recipient: phone, text: message, instanceId });
  if (!out?.ok) {
    const phoneDisplay = String(leadDoc?.phone || phone || '').trim();
    void createInternalNotification({
      academy_id: academyId,
      type: 'automation_send_failed',
      title: 'Falha na automação WhatsApp',
      body: `Não foi possível enviar "${automationKey || templateKey}" para ${phoneDisplay || 'contato'}. Verifique a conexão com o WhatsApp.`,
      action_url: phoneDisplay ? `/inbox?phone=${encodeURIComponent(phoneDisplay)}` : '/automacoes?tab=configuracoes',
      severity: 'high',
      phone: phoneDisplay,
      lead_id: leadId,
    }).catch((e) => console.warn('[sendAutomationCron] notification failed', e?.message || e));
    return { ok: false, skipped: 'send_failed' };
  }

  if (academyId && leadId) {
    const sentAt = new Date().toISOString();
    await addLeadEventServer({
      academyId,
      leadId,
      type: 'whatsapp_template_sent',
      text: String(templateKey),
      at: sentAt,
      createdBy: 'automation',
      payloadJson: {
        templateKey: String(templateKey),
        automationKey: String(automationKey || '').trim() || null,
        leadId,
        sentAt,
        channel: 'cron',
      },
    }).catch(() => null);
  }

  return { ok: true };
}

export { parseAutomationsConfig };
