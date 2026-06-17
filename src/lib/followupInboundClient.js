/**
 * Utilitários de merge para mapas de inbound (usado pelo hook).
 * Consultas diretas ao Appwrite no browser foram removidas — use /api/agent?route=followup-inbound.
 */

import { pickLatestInboundIso } from './followupInbound.js';

export function isInboundMapsEmpty(maps) {
  if (!maps) return true;
  return (
    Object.keys(maps.inboundAfterByLead || {}).length === 0 &&
    Object.keys(maps.inboundAfterByPhone || {}).length === 0
  );
}

/** Mescla mapas de inbound preservando o timestamp mais recente por chave. */
export function mergeFollowupInboundMaps(...sources) {
  const merged = { inboundAfterByLead: {}, inboundAfterByPhone: {} };
  for (const src of sources) {
    if (!src) continue;
    for (const [leadId, at] of Object.entries(src.inboundAfterByLead || {})) {
      merged.inboundAfterByLead[leadId] = pickLatestInboundIso(merged.inboundAfterByLead[leadId], at);
    }
    for (const [phone, at] of Object.entries(src.inboundAfterByPhone || {})) {
      merged.inboundAfterByPhone[phone] = pickLatestInboundIso(merged.inboundAfterByPhone[phone], at);
    }
  }
  return merged;
}
