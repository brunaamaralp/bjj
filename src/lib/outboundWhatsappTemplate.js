import { account } from './appwrite';
import {
  applyWhatsappTemplatePlaceholders,
  validateTemplatePlaceholders,
} from '../../lib/whatsappTemplateDefaults.js';
import { friendlyError } from './errorMessages.js';
import { addLeadEvent } from './leadEvents.js';

export function normalizePhoneForWaMe(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
}

/**
 * @param {{
 *   lead: Record<string, unknown>;
 *   academyId: string;
 *   academyName?: string;
 *   templateKey: string;
 *   automationKey?: string;
 *   templatesMap: Record<string, string>;
 *   zapsterInstanceId?: string;
 *   onToast?: (t: { type: string; message: string }) => void;
 *   suppressToasts?: boolean;
 *   permissionContext?: { teamId?: string; userId?: string };
 *   createdBy?: string;
 * }} p
 */
export async function sendWhatsappTemplateOutbound({
  lead,
  academyId,
  academyName,
  templateKey,
  automationKey = '',
  templatesMap,
  zapsterInstanceId,
  onToast,
  suppressToasts = false,
  permissionContext = {},
  createdBy = 'user',
}) {
  const toast = (t) => {
    if (!suppressToasts) onToast?.(t);
  };
  const raw = templatesMap[templateKey];
  if (!raw || !String(raw).trim()) {
    toast({ type: 'error', message: 'Template vazio ou inexistente.' });
    return { ok: false, reason: 'empty_template' };
  }
  const placeholderCheck = validateTemplatePlaceholders(String(raw));
  if (!placeholderCheck.ok) {
    toast({
      type: 'warning',
      message: `Variáveis desconhecidas serão omitidas: ${placeholderCheck.unknown.join(', ')}`,
    });
  }
  const phoneRaw = String(lead?.phone || '').trim();
  if (!phoneRaw) {
    toast({ type: 'error', message: 'Telefone ausente no lead.' });
    return { ok: false, reason: 'no_phone' };
  }
  const message = applyWhatsappTemplatePlaceholders(String(raw), { lead, academyName });
  const inst = String(zapsterInstanceId || '').trim();
  const leadId = String(lead?.id || lead?.$id || '').trim();
  const sentAt = new Date().toISOString();

  const recordSent = async () => {
    if (!leadId) return;
    try {
      await addLeadEvent({
        academyId,
        leadId,
        type: 'whatsapp_template_sent',
        text: String(templateKey),
        at: sentAt,
        createdBy,
        payloadJson: {
          templateKey: String(templateKey),
          automationKey: String(automationKey || '').trim() || null,
          leadId,
          sentAt,
        },
        permissionContext,
      });
    } catch {
      void 0;
    }
  };

  if (inst) {
    try {
      const jwt = await account.createJWT();
      const resp = await fetch('/api/whatsapp?action=send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt.jwt}`,
          'x-academy-id': String(academyId || ''),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          phone: phoneRaw,
          text: message,
          proactive: true,
          lead_id: leadId || undefined,
        }),
      });
      const txt = await resp.text();
      let j = {};
      try {
        j = JSON.parse(txt);
      } catch {
        j = {};
      }
      if (!resp.ok) {
        let msg = 'Falha ao enviar';
        if (j && typeof j === 'object' && typeof j.erro === 'string' && j.erro.trim()) msg = String(j.erro).trim();
        else if (txt) msg = txt.slice(0, 200);
        const skipReason = j && typeof j === 'object' ? String(j.skipped || j.code || '').trim() : '';
        if (
          skipReason === 'no_recent_interaction' ||
          (resp.status === 409 && /conversa/i.test(msg))
        ) {
          toast({ type: 'warning', message: msg });
          return { ok: false, reason: 'no_recent_interaction', error: msg };
        }
        toast({ type: 'error', message: msg });
        return { ok: false, reason: 'send_failed', error: msg };
      }
      await recordSent();
      if (j?.channel === 'wa_me' && typeof j.wa_me_url === 'string' && j.wa_me_url.trim()) {
        window.open(j.wa_me_url.trim(), '_blank', 'noopener,noreferrer');
        toast({ type: 'success', message: 'Abra o WhatsApp para concluir o envio.' });
        return { ok: true, channel: 'wa_me' };
      }
      toast({ type: 'success', message: 'Mensagem enviada!' });
      return { ok: true, channel: 'api' };
    } catch (e) {
      const msg = friendlyError(e, 'send') || 'WhatsApp desconectado. Verifique a página Agente IA.';
      toast({ type: 'error', message: msg });
      return { ok: false, reason: 'send_failed', error: msg };
    }
  }

  const digits = normalizePhoneForWaMe(phoneRaw);
  if (!digits) {
    toast({ type: 'error', message: 'Telefone inválido.' });
    return { ok: false, reason: 'no_phone' };
  }
  await recordSent();
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
  return { ok: true, channel: 'wa_me' };
}
