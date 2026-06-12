import { account } from './appwrite';
import { fetchWithBillingGuard } from './billingBlockedFetch';
import { normalizePhoneForWaMe } from './outboundWhatsappTemplate.js';

async function followupCopilotRequest({ academyId, leadId, method, body }) {
  const jwt = await account.createJWT();
  const token = String(jwt?.jwt || '').trim();
  const aid = String(academyId || '').trim();
  const lid = String(leadId || '').trim();
  if (!token || !aid || !lid) throw new Error('Dados incompletos');

  const url =
    method === 'GET'
      ? `/api/agent?route=lead-summary&leadId=${encodeURIComponent(lid)}`
      : '/api/agent?route=followup-copilot';

  const { blocked, res } = await fetchWithBillingGuard(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-academy-id': aid,
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  if (blocked) throw new Error('Plano bloqueado');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.erro || `HTTP ${res.status}`);
  return data;
}

/**
 * @param {{ academyId: string; leadId: string }} params
 */
export async function fetchLeadSummaryPeek({ academyId, leadId }) {
  return followupCopilotRequest({ academyId, leadId, method: 'GET' });
}

/**
 * @param {{ academyId: string; leadId: string; mode: 'summary' | 'draft'; templateKey?: string; nextAction?: string; forceRefresh?: boolean }} params
 */
export async function fetchFollowupCopilot({ academyId, leadId, mode, templateKey, nextAction, forceRefresh }) {
  const lid = String(leadId || '').trim();
  return followupCopilotRequest({
    academyId,
    leadId: lid,
    method: 'POST',
    body: {
      mode,
      leadId: lid,
      templateKey: templateKey || undefined,
      nextAction: nextAction || undefined,
      forceRefresh: forceRefresh === true ? true : undefined,
    },
  });
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
