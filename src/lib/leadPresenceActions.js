import { LEAD_STATUS } from './leadStatus.js';

/** Volta o lead para experimental agendada (desfaz Veio / Não veio). */
export function buildLeadPresenceUndoPatch(lead) {
  const status = String(lead?.status || '').trim();
  if (status !== LEAD_STATUS.COMPLETED && status !== LEAD_STATUS.MISSED) {
    return null;
  }
  return {
    status: LEAD_STATUS.SCHEDULED,
    pipelineStage: 'Aula experimental',
    attendedAt: null,
    missedAt: null,
  };
}

export function canUndoLeadPresence(lead) {
  return buildLeadPresenceUndoPatch(lead) != null;
}
