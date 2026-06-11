/** Disparado após gravar evento na timeline do lead (lead_events). */
export const LEAD_TIMELINE_CHANGED = 'navi-lead-timeline-changed';

/** Disparado após check-in NL (coleção attendance, não lead_events). */
export const LEAD_ATTENDANCE_CHANGED = 'navi-lead-attendance-changed';
export const LEADS_REFRESH = 'navi-leads-refresh';
/** Disparado quando uma conversa WhatsApp recebe mensagem do cliente. */
export const FOLLOWUP_INBOUND_CHANGED = 'navi-followup-inbound-changed';

/**
 * @param {string} leadId
 * @param {{ eventType?: string }} [extra]
 */
export function emitLeadTimelineChanged(leadId, extra = {}) {
  if (typeof window === 'undefined') return;
  const id = String(leadId || '').trim();
  if (!id) return;
  window.dispatchEvent(new CustomEvent(LEAD_TIMELINE_CHANGED, { detail: { leadId: id, ...extra } }));
}

/**
 * @param {string} leadId
 */
export function emitLeadAttendanceChanged(leadId) {
  if (typeof window === 'undefined') return;
  const id = String(leadId || '').trim();
  if (!id) return;
  window.dispatchEvent(new CustomEvent(LEAD_ATTENDANCE_CHANGED, { detail: { leadId: id } }));
}

/**
 * @param {{ reason?: string }} [detail]
 */
export function emitLeadsRefresh(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LEADS_REFRESH, { detail }));
}

/**
 * @param {{ academyId?: string; leadId?: string; phone?: string; lastUserMsgAt?: string }} detail
 */
export function emitFollowupInboundChanged(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FOLLOWUP_INBOUND_CHANGED, { detail }));
}
