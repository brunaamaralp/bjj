import { account } from './appwrite';
import { applyWhatsappTemplatePlaceholders } from '../../lib/whatsappTemplateDefaults.js';

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
 *   templatesMap: Record<string, string>;
 *   zapsterInstanceId?: string;
 *   onToast?: (t: { type: string; message: string }) => void;
 * }} p
 */
export async function sendWhatsappTemplateOutbound({
  lead,
  academyId,
  academyName,
  templateKey,
  templatesMap,
  zapsterInstanceId,
  onToast
}) {
  const raw = templatesMap[templateKey];
  if (!raw || !String(raw).trim()) {
    onToast?.({ type: 'error', message: 'Template vazio ou inexistente.' });
    return { ok: false };
  }
  const phoneRaw = String(lead?.phone || '').trim();
  if (!phoneRaw) {
    onToast?.({ type: 'error', message: 'Telefone ausente no lead.' });
    return { ok: false };
  }
  const message = applyWhatsappTemplatePlaceholders(String(raw), { lead, academyName });
  const inst = String(zapsterInstanceId || '').trim();

  if (inst) {
    try {
      const jwt = await account.createJWT();
      const resp = await fetch('/api/whatsapp?action=send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt.jwt}`,
          'x-academy-id': String(academyId || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ phone: phoneRaw, text: message })
      });
      const txt = await resp.text();
      if (!resp.ok) {
        let msg = 'Falha ao enviar';
        try {
          const j = JSON.parse(txt);
          if (j?.erro) msg = String(j.erro);
        } catch {
          if (txt) msg = txt.slice(0, 200);
        }
        onToast?.({ type: 'error', message: msg });
        return { ok: false };
      }
      onToast?.({ type: 'success', message: 'Mensagem enviada!' });
      return { ok: true };
    } catch (e) {
      onToast?.({ type: 'error', message: e?.message || 'Erro ao enviar' });
      return { ok: false };
    }
  }

  const digits = normalizePhoneForWaMe(phoneRaw);
  if (!digits) {
    onToast?.({ type: 'error', message: 'Telefone inválido.' });
    return { ok: false };
  }
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
  return { ok: true };
}
