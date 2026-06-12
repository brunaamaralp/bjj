import { addLeadEventServer, listLeadEventsServer } from './leadEvents.js';

const HIGHLIGHT_TYPE = 'conversation_highlight';

function parsePayload(payloadJson) {
  if (!payloadJson) return null;
  try {
    return typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
  } catch {
    return null;
  }
}

/**
 * @param {string} leadId
 * @param {string} academyId
 * @param {string} messageId
 * @param {typeof listLeadEventsServer} listEvents
 */
export async function wasHighlightRecorded(leadId, academyId, messageId, listEvents = listLeadEventsServer) {
  const mid = String(messageId || '').trim();
  if (!mid) return false;
  const events = await listEvents(leadId, academyId, 60);
  return events.some((ev) => {
    if (String(ev?.type || '') !== HIGHLIGHT_TYPE) return false;
    const p = parsePayload(ev.payload_json);
    return p?.message_id === mid;
  });
}

/**
 * @param {object} params
 */
export async function recordConversationHighlight({
  enabled,
  highlight,
  academyId,
  leadId,
  messageId,
  conversationId,
  addLeadEvent = addLeadEventServer,
  listEvents = listLeadEventsServer,
}) {
  if (!enabled) return { recorded: false, reason: 'disabled' };
  const h = highlight && typeof highlight === 'object' ? highlight : {};
  const text = String(h.text || '').trim();
  if (String(h.confidence) !== 'high' || !text) {
    return { recorded: false, reason: 'low_confidence' };
  }
  const lid = String(leadId || '').trim();
  if (!lid) return { recorded: false, reason: 'no_lead' };
  if (await wasHighlightRecorded(lid, academyId, messageId, listEvents)) {
    return { recorded: false, reason: 'idempotent' };
  }
  await addLeadEvent({
    academyId,
    leadId: lid,
    type: HIGHLIGHT_TYPE,
    text: text.slice(0, 1000),
    createdBy: 'ai-agent',
    payloadJson: {
      message_id: String(messageId || '').trim() || null,
      conversation_id: String(conversationId || '').trim() || null,
      categories: Array.isArray(h.categories) ? h.categories : [],
    },
  });
  return { recorded: true };
}

export { HIGHLIGHT_TYPE };
