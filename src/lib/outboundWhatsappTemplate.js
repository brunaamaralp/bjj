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
  permissionContext = {},
  createdBy = 'user',
}) {
  const raw = templatesMap[templateKey];
  if (!raw || !String(raw).trim()) {
    onToast?.({ type: 'error', message: 'Template vazio ou inexistente.' });
    return { ok: false };
  }
  const placeholderCheck = validateTemplatePlaceholders(String(raw));
  if (!placeholderCheck.ok) {
    onToast?.({
      type: 'warning',
      message: `Variáveis desconhecidas serão omitidas: ${placeholderCheck.unknown.join(', ')}`,
    });
  }
  const phoneRaw = String(lead?.phone || '').trim();
  if (!phoneRaw) {
    onToast?.({ type: 'error', message: 'Telefone ausente no lead.' });
    return { ok: false };
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
        body: JSON.stringify({ phone: phoneRaw, text: message }),
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
        onToast?.({ type: 'error', message: msg });
        return { ok: false };
      }
      await recordSent();
      if (j?.channel === 'wa_me' && typeof j.wa_me_url === 'string' && j.wa_me_url.trim()) {
        window.open(j.wa_me_url.trim(), '_blank', 'noopener,noreferrer');
        onToast?.({ type: 'success', message: 'Abra o WhatsApp para concluir o envio.' });
        return { ok: true };
      }
      onToast?.({ type: 'success', message: 'Mensagem enviada!' });
      return { ok: true };
    } catch (e) {
      onToast?.({
        type: 'error',
        message: friendlyError(e, 'send') || 'WhatsApp desconectado. Verifique a página Agente IA.',
      });
      return { ok: false };
    }
  }

  const digits = normalizePhoneForWaMe(phoneRaw);
  if (!digits) {
    onToast?.({ type: 'error', message: 'Telefone inválido.' });
    return { ok: false };
  }
  await recordSent();
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
  return { ok: true };
}
