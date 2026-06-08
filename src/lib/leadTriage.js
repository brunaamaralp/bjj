/** @typedef {'pending' | 'confirmed' | ''} LeadTriageStatus */

export const LEAD_TRIAGE_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
};

/**
 * Lead criado automaticamente pelo WhatsApp (inbound desconhecido).
 * @param {object | null | undefined} lead
 */
export function isInboundAutoLead(lead) {
  if (!lead) return false;
  if (lead.inboundAuto === true) return true;
  const raw = String(lead.inbound_auto ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

/**
 * Lead aguardando triagem no funil (badge + ações rápidas).
 * @param {object | null | undefined} lead
 */
export function isLeadPendingTriage(lead) {
  if (!lead) return false;
  const status = String(lead.triageStatus || lead.triage_status || '').trim().toLowerCase();
  if (status === LEAD_TRIAGE_STATUS.CONFIRMED) return false;
  if (status === LEAD_TRIAGE_STATUS.PENDING) return true;
  return isInboundAutoLead(lead);
}
