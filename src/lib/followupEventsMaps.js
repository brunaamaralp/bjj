/**
 * Agrega documentos lead_events em mapas por lead (retornos / contato / snooze).
 * Compartilhado entre cliente legado e API server-side.
 */

export function parseFollowupEventPayload(doc) {
  const raw = doc?.payload_json ?? doc?.payloadJson;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * @param {Array<object>} docs
 * @returns {{ doneByLead: Record<string, string>, contactByLead: Record<string, string>, snoozeUntilByLead: Record<string, string> }}
 */
export function buildFollowupEventMapsFromDocs(docs) {
  const doneByLead = {};
  const contactByLead = {};
  const snoozeUntilByLead = {};

  for (const d of Array.isArray(docs) ? docs : []) {
    const leadId = String(d?.lead_id || '').trim();
    const at = String(d?.at || '').trim();
    const type = String(d?.type || '').trim();
    if (!leadId || !at) continue;
    const payload = parseFollowupEventPayload(d);
    if (type === 'followup_done' && !doneByLead[leadId]) doneByLead[leadId] = at;
    if (type === 'followup_contact' && !contactByLead[leadId]) contactByLead[leadId] = at;
    if (type === 'whatsapp_template_sent' && !contactByLead[leadId]) {
      const key = String(payload.automationKey || '').trim();
      if (key === 'presence_confirmed' || key === 'followup_d1_attended' || key === 'missed') {
        contactByLead[leadId] = at;
      }
    }
    if (type === 'followup_snooze' && !snoozeUntilByLead[leadId]) {
      const until = String(payload.untilYmd || '').slice(0, 10);
      if (until) snoozeUntilByLead[leadId] = until;
    }
  }

  return { doneByLead, contactByLead, snoozeUntilByLead };
}
