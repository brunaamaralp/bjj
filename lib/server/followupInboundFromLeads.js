import { Query } from 'node-appwrite';
import { LEAD_STATUS } from '../../src/lib/leadStatus.js';
import { FOLLOWUP_AGENDA_MAX_DAYS, getFollowupDaysAgo } from '../../src/lib/followupState.js';
import {
  extractLastUserMessageAt,
  mergeInboundIntoMaps,
} from '../../src/lib/followupInbound.js';
import { findConversationDoc } from './conversationsStore.js';
import { DB_ID, LEADS_COL } from './appwriteCollections.js';

const LEAD_SELECT = ['$id', 'phone', 'phone_number', 'status', 'scheduledDate', 'origin', 'source', '$createdAt'];
const CONV_INBOUND_SELECT = [
  'lead_id',
  'phone_number',
  'last_user_msg_at',
  'last_message_role',
  'last_message_timestamp',
  'messages_recent',
  'messages',
];

function excludeImportedOrigin(doc) {
  const origin = String(doc?.origin || doc?.source || '').trim();
  return origin !== 'Planilha';
}

/** @param {import('node-appwrite').Models.Document} doc */
export function isFollowupLeadForInbound(doc, now = new Date()) {
  const status = String(doc?.status || '').trim();
  if (status !== LEAD_STATUS.COMPLETED && status !== LEAD_STATUS.MISSED) return false;
  if (!excludeImportedOrigin(doc)) return false;
  const daysAgo = getFollowupDaysAgo(
    {
      scheduledDate: doc?.scheduledDate,
      createdAt: doc?.$createdAt,
    },
    now
  );
  if (daysAgo < 0 || daysAgo >= FOLLOWUP_AGENDA_MAX_DAYS) return false;
  const phone = String(doc?.phone || doc?.phone_number || '').replace(/\D/g, '');
  return phone.length >= 8;
}

/**
 * Garante inbound para leads em retorno (Compareceu/Não compareceu) via lookup direto por telefone/lead_id.
 * Complementa o scan por updated_at — evita perder conversas fora das primeiras páginas.
 *
 * @param {import('node-appwrite').Services.Databases} databases
 * @param {string} academyId
 * @param {{ inboundAfterByLead: Record<string, string>; inboundAfterByPhone: Record<string, string> }} maps
 */
export async function enrichInboundMapsFromFollowupLeads(databases, academyId, maps) {
  if (!databases || !LEADS_COL || !DB_ID) return maps;
  const aid = String(academyId || '').trim();
  if (!aid) return maps;

  const seenLeadIds = new Set();
  let cursor = null;
  let pageCount = 0;

  do {
    const queries = [
      Query.equal('academyId', [aid]),
      Query.equal('status', [LEAD_STATUS.COMPLETED, LEAD_STATUS.MISSED]),
      Query.orderDesc('$updatedAt'),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    let list;
    try {
      list = await databases.listDocuments(DB_ID, LEADS_COL, [...queries, Query.select(LEAD_SELECT)]);
    } catch {
      list = await databases.listDocuments(DB_ID, LEADS_COL, queries);
    }

    const page = list.documents || [];
    for (const lead of page) {
      if (!isFollowupLeadForInbound(lead)) continue;
      const leadId = String(lead.$id || '').trim();
      if (!leadId || seenLeadIds.has(leadId)) continue;
      seenLeadIds.add(leadId);

      const phone = String(lead.phone || lead.phone_number || '').trim();
      const conv = await findConversationDoc(phone, aid, {
        leadId,
        selectAttrs: CONV_INBOUND_SELECT,
      });
      if (!conv) continue;

      const lastUserMsgAt = extractLastUserMessageAt(conv);
      if (!lastUserMsgAt) continue;

      mergeInboundIntoMaps(maps, {
        leadId,
        phone: conv.phone_number || phone,
        lastUserMsgAt,
      });
    }

    cursor = page.length === 100 ? page[page.length - 1]?.$id : null;
    pageCount += 1;
  } while (cursor && pageCount < 5);

  return maps;
}
