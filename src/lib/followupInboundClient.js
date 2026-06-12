import { Query } from 'appwrite';
import { databases, DB_ID, CONVERSATIONS_COL } from './appwrite.js';
import { LEAD_STATUS } from './leadStatus.js';
import { FOLLOWUP_AGENDA_MAX_DAYS, getFollowupDaysAgo } from './followupState.js';
import {
  buildInboundMapsFromConversations,
  extractLastUserMessageAt,
  mergeInboundIntoMaps,
  pickLatestInboundIso,
} from './followupInbound.js';
import { inboxPhoneLookupVariants } from './normalizeInboxPhone.js';

const CONV_SELECT = [
  'lead_id',
  'phone_number',
  'last_user_msg_at',
  'last_message_role',
  'last_message_timestamp',
  'messages_recent',
  'messages',
];

function isFollowupLeadForInbound(lead, now = new Date()) {
  const status = String(lead?.status || '').trim();
  if (status !== LEAD_STATUS.COMPLETED && status !== LEAD_STATUS.MISSED) return false;
  if (String(lead?.origin || '').trim() === 'Planilha') return false;
  const daysAgo = getFollowupDaysAgo(lead, now);
  if (daysAgo < 0 || daysAgo >= FOLLOWUP_AGENDA_MAX_DAYS) return false;
  const phone = String(lead?.phone || lead?.phone_number || '').replace(/\D/g, '');
  return phone.length >= 8;
}

async function findConversationForLead(academyId, lead) {
  const aid = String(academyId || '').trim();
  if (!aid || !CONVERSATIONS_COL || !DB_ID) return null;
  const leadId = String(lead?.id || '').trim();

  if (leadId) {
    try {
      const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
        Query.equal('academy_id', [aid]),
        Query.equal('lead_id', [leadId]),
        Query.limit(1),
      ]);
      const doc = list.documents?.[0];
      if (doc) return doc;
    } catch {
      void 0;
    }
  }

  for (const variant of inboxPhoneLookupVariants(lead?.phone || lead?.phone_number)) {
    try {
      const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
        Query.equal('academy_id', [aid]),
        Query.equal('phone_number', [variant]),
        Query.limit(1),
      ]);
      const doc = list.documents?.[0];
      if (doc) return doc;
    } catch {
      void 0;
    }
  }

  return null;
}

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

/**
 * Fallback no browser: busca conversa por telefone/lead_id de cada retorno pendente.
 * @param {string} academyId
 * @param {object[]} leads
 */
export async function loadFollowupInboundMapsFromClient(academyId, leads) {
  if (!CONVERSATIONS_COL || !DB_ID) return null;

  const maps = { inboundAfterByLead: {}, inboundAfterByPhone: {} };
  const followupLeads = (leads || []).filter(isFollowupLeadForInbound);
  if (!followupLeads.length) return maps;

  for (const lead of followupLeads) {
    const conv = await findConversationForLead(academyId, lead);
    if (!conv) continue;
    const lastUserMsgAt = extractLastUserMessageAt(conv);
    if (!lastUserMsgAt) continue;
    mergeInboundIntoMaps(maps, {
      leadId: lead.id,
      phone: conv.phone_number || lead.phone,
      lastUserMsgAt,
    });
  }

  return maps;
}

/** Varredura recente por updated_at (complemento). */
export async function scanRecentInboundMapsFromClient(academyId, { maxPages = 3 } = {}) {
  if (!CONVERSATIONS_COL || !DB_ID) return null;
  const aid = String(academyId || '').trim();
  if (!aid) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FOLLOWUP_AGENDA_MAX_DAYS);
  const cutoffMs = cutoff.getTime();
  const matched = [];
  let cursor = null;
  let pageCount = 0;

  do {
    const queries = [
      Query.equal('academy_id', [aid]),
      Query.orderDesc('updated_at'),
      Query.limit(50),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    let list;
    try {
      list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, queries);
    } catch {
      break;
    }

    const page = list.documents || [];
    for (const doc of page) {
      const at = extractLastUserMessageAt(doc);
      if (!at) continue;
      const atMs = new Date(at).getTime();
      if (!Number.isFinite(atMs) || atMs < cutoffMs) continue;
      matched.push(doc);
    }

    cursor = page.length === 50 ? page[page.length - 1]?.$id : null;
    pageCount += 1;
  } while (cursor && pageCount < maxPages);

  return buildInboundMapsFromConversations(matched);
}
