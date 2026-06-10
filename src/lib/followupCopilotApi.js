import { account } from './appwrite';
import { fetchWithBillingGuard } from './billingBlockedFetch';
import { normalizePhoneForWaMe } from './outboundWhatsappTemplate.js';

/**
 * @param {{ academyId: string; leadId: string; mode: 'summary' | 'draft'; templateKey?: string; nextAction?: string }} params
 */
export async function fetchFollowupCopilot({ academyId, leadId, mode, templateKey, nextAction }) {
  const jwt = await account.createJWT();
  const token = String(jwt?.jwt || '').trim();
  const aid = String(academyId || '').trim();
  const lid = String(leadId || '').trim();
  if (!token || !aid || !lid) throw new Error('Dados incompletos');

  const { blocked, res } = await fetchWithBillingGuard('/api/agent?route=followup-copilot', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-academy-id': aid,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mode,
      leadId: lid,
      templateKey: templateKey || undefined,
      nextAction: nextAction || undefined,
    }),
  });
  if (blocked) throw new Error('Plano bloqueado');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.erro || `HTTP ${res.status}`);
  return data;
}

/** Abre WhatsApp com texto sugerido (revisão humana antes do envio). */
export function openWhatsappDraft(phone, text) {
  const digits = normalizePhoneForWaMe(phone);
  const body = String(text || '').trim();
  if (!digits || !body) return false;
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
