import { findConversationDoc } from './conversationsStore.js';
import { findLeadByPhone } from './ensureWhatsAppInboundLead.js';
import { Client, Databases } from 'node-appwrite';
import {
  evaluateRecentWhatsappInteraction,
  isProactiveWhatsappGateEnabled,
  proactiveWhatsappUserMessage,
  PROACTIVE_SKIP_REASON,
  resolveLastInboundInteractionAt,
  resolveProactiveInteractionDays,
} from '../proactiveWhatsappGate.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const PEOPLE_COL = STUDENTS_COL || LEADS_COL;

const PROACTIVE_GATE_SELECT_ATTRS = [
  '$id',
  'last_user_msg_at',
  'last_message_role',
  'last_message_timestamp',
  'messages_recent',
  'messages',
  'lead_id',
];

const adminClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const defaultDatabases = adminClient ? new Databases(adminClient) : null;

function normalizePhoneDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

async function fetchLeadDoc(databases, { academyId, leadId, phone }) {
  const db = databases || defaultDatabases;
  if (!db || !DB_ID || !PEOPLE_COL) return null;

  const lid = String(leadId || '').trim();
  if (lid) {
    try {
      return await db.getDocument(DB_ID, PEOPLE_COL, lid);
    } catch {
      void 0;
    }
  }

  const p = normalizePhoneDigits(phone);
  const a = String(academyId || '').trim();
  if (!p || !a || !LEADS_COL) return null;
  return findLeadByPhone(db, p, a);
}

/**
 * @param {{ phone: string; academyId: string; leadId?: string; leadDoc?: object; databases?: import('node-appwrite').Databases; nowMs?: number }} p
 */
export async function checkProactiveWhatsappAllowed({
  phone,
  academyId,
  leadId = '',
  leadDoc = null,
  databases = null,
  nowMs = Date.now(),
} = {}) {
  const windowDays = resolveProactiveInteractionDays();
  if (!isProactiveWhatsappGateEnabled(windowDays)) {
    return { allowed: true, reason: null, windowDays: 0 };
  }

  const a = String(academyId || '').trim();
  const p = normalizePhoneDigits(phone);
  if (!a || !p) {
    return {
      allowed: false,
      reason: PROACTIVE_SKIP_REASON,
      message: proactiveWhatsappUserMessage(windowDays),
      windowDays,
    };
  }

  let resolvedLead = leadDoc;
  if (!resolvedLead) {
    resolvedLead = await fetchLeadDoc(databases, { academyId: a, leadId, phone: p });
  }

  const conv = await findConversationDoc(p, a, {
    leadId: String(leadId || resolvedLead?.$id || '').trim(),
    selectAttrs: PROACTIVE_GATE_SELECT_ATTRS,
  });

  const lastUserMsgAt = resolveLastInboundInteractionAt({
    conversationDoc: conv,
    leadDoc: resolvedLead,
  });
  const evalResult = evaluateRecentWhatsappInteraction({ lastUserMsgAt, nowMs, windowDays });

  if (evalResult.allowed) {
    return {
      allowed: true,
      reason: null,
      lastUserMsgAt: evalResult.lastUserMsgAt,
      daysSince: evalResult.daysSince,
      windowDays,
    };
  }

  return {
    allowed: false,
    reason: PROACTIVE_SKIP_REASON,
    message: proactiveWhatsappUserMessage(windowDays),
    lastUserMsgAt: evalResult.lastUserMsgAt || null,
    daysSince: evalResult.daysSince,
    windowDays,
  };
}

export { PROACTIVE_SKIP_REASON, proactiveWhatsappUserMessage, resolveProactiveInteractionDays };
