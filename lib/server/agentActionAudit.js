import { Query } from 'node-appwrite';
import { addLeadEventServer, listLeadEventsServer } from './leadEvents.js';

const AI_ACTION_TYPE = 'ai_action';

/**
 * @param {string} payloadJson
 */
function parsePayload(payloadJson) {
  if (!payloadJson) return null;
  try {
    return typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
  } catch {
    return null;
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {string} leadId
 * @param {string} messageId
 * @param {string} action
 */
export async function wasActionProcessed(databases, academyId, leadId, messageId, action) {
  const mid = String(messageId || '').trim();
  const act = String(action || '').trim();
  const lid = String(leadId || '').trim();
  if (!mid || !act || !lid) return false;

  const events = await listLeadEventsServer(lid, academyId, 80);
  for (const ev of events) {
    if (String(ev?.type || '') !== AI_ACTION_TYPE) continue;
    const p = parsePayload(ev.payload_json);
    if (p?.message_id === mid && p?.action === act) return true;
  }
  return false;
}

/**
 * @param {{
 *   academyId: string,
 *   leadId: string,
 *   conversationId?: string,
 *   messageId?: string,
 *   action: string,
 *   result: 'success' | 'failure' | 'skipped',
 *   summary?: string,
 *   payload?: object,
 * }} params
 */
export async function recordAiAction({
  academyId,
  leadId,
  conversationId,
  messageId,
  action,
  result,
  summary,
  payload = {},
}) {
  const lid = String(leadId || '').trim();
  if (!lid) return null;

  return addLeadEventServer({
    academyId,
    leadId: lid,
    type: AI_ACTION_TYPE,
    text: String(summary || action).slice(0, 1000),
    createdBy: 'ai-agent',
    payloadJson: {
      action: String(action || '').trim(),
      result: String(result || '').trim(),
      message_id: String(messageId || '').trim() || null,
      conversation_id: String(conversationId || '').trim() || null,
      ...payload,
    },
  });
}

export { AI_ACTION_TYPE };
