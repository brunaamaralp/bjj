/** Disparado após gravar evento na timeline do lead (lead_events). */
export const LEAD_TIMELINE_CHANGED = 'navi-lead-timeline-changed';

/** Disparado após check-in NL (coleção attendance, não lead_events). */
export const LEAD_ATTENDANCE_CHANGED = 'navi-lead-attendance-changed';

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
