import { Client, Databases, Query, Account, Teams } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import { humanHandoffIsActive, humanHandoffUntilFromMs } from '../lib/humanHandoffUntil.js';
import { getHumanHandoffHoursForServer, assertHumanHandoffEnvOnBoot } from '../lib/constants.js';

assertHumanHandoffEnvOnBoot();
import { waitUntil } from '@vercel/functions';
import {
  safeParseMessages,
  getOrCreateConversationDoc,
  findConversationDoc,
  getConversationDocForThread,
  getConversationMessagesDoc,
  backfillMessagesRecentFromFull,
} from '../lib/server/conversationsStore.js';
import {
  deriveLastMessageMeta,
  hasStoredLastMessageMeta,
  readStoredLastMessageMeta,
} from '../lib/server/conversationListMeta.js';
import {
  conversationMessagesStoragePayload,
  loadThreadMessagesFromDoc,
  threadNeedsFullMessagesFetch,
  hasUsableMessagesRecent,
} from '../lib/server/conversationMessages.js';
import { assertBillingActive, sendBillingGateError } from '../lib/server/billingGate.js';
import conversationNotesHandler from '../lib/server/conversationNotesHandler.js';
import notificationsHandler from '../lib/server/notificationsHandler.js';
import messageFlagsHandler from '../lib/server/messageFlagsHandler.js';
import { rehydrateConversationMediaMessages } from '../lib/server/rehydrateConversationMedia.js';
import {
  getInboxListStatsCached,
  setInboxListStatsCached,
} from '../lib/server/inboxListStatsCache.js';
import { enrichConversationListDocs } from '../lib/server/inboxListLeadEnrichment.js';


const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const NOTE_NOTIFICATIONS_COL = process.env.APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);
const teams = new Teams(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

const LIST_SELECT_ATTRS = [
  '$id',
  'phone_number',
  'updated_at',
  'unread_count',
  'human_handoff_until',
  'ticket_status',
  'transfer_to',
  'lead_id',
  'lead_name',
  'contact_name',
  'contact_name_source',
  'whatsapp_profile_name',
  'whatsapp_profile_image_url',
  'last_read_at',
  'last_user_msg_at',
  'archived',
  'last_preview',
  'last_message_role',
  'last_message_sender',
  'last_message_timestamp',
];

const SERVER_LIST_FILTERS = new Set(['unread', 'needs_me', 'resolved', 'transferred']);

async function listConversationDocs(queries) {
  const withSelect = [...queries, Query.select(LIST_SELECT_ATTRS)];
  try {
    return await databases.listDocuments(DB_ID, CONVERSATIONS_COL, withSelect);
  } catch {
    return await databases.listDocuments(DB_ID, CONVERSATIONS_COL, queries);
  }
}

async function countConversations(queries) {
  try {
    const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [...queries, Query.limit(1)]);
    return Number(list?.total || 0);
  } catch {
    return 0;
  }
}

function appendListFilterQueries(queries, filterRaw) {
  const filter = String(filterRaw || '').trim().toLowerCase();
  if (!SERVER_LIST_FILTERS.has(filter)) return filter;
  const nowIso = new Date().toISOString();
  if (filter === 'unread') queries.push(Query.greaterThan('unread_count', 0));
  else if (filter === 'needs_me') queries.push(Query.greaterThan('human_handoff_until', nowIso));
  else if (filter === 'resolved') queries.push(Query.equal('ticket_status', ['resolved']));
  else if (filter === 'transferred') queries.push(Query.equal('ticket_status', ['transferred']));
  return filter;
}

function ensureConfig(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !CONVERSATIONS_COL || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  return true;
}


async function fetchListStats(academyId, archivedOnly) {
  const cached = getInboxListStatsCached(academyId, archivedOnly);
  if (cached) return cached;

  const baseQueries = [Query.equal('academy_id', [academyId])];
  if (archivedOnly) {
    baseQueries.push(Query.equal('archived', [true]));
  } else {
    baseQueries.push(Query.notEqual('archived', [true]));
  }
  const nowIso = new Date().toISOString();
  const [unread_conversations, needs_me, resolved, transferred] = await Promise.all([
    countConversations([...baseQueries, Query.greaterThan('unread_count', 0)]),
    countConversations([...baseQueries, Query.greaterThan('human_handoff_until', nowIso)]),
    countConversations([...baseQueries, Query.equal('ticket_status', ['resolved'])]),
    countConversations([...baseQueries, Query.equal('ticket_status', ['transferred'])]),
  ]);
  const stats = { unread_conversations, needs_me, resolved, transferred };
  setInboxListStatsCached(academyId, archivedOnly, stats);
  return stats;
}

function parseSummaryField(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function docToListItem(doc, leadSnippet = null) {
  const meta = hasStoredLastMessageMeta(doc)
    ? readStoredLastMessageMeta(doc)
    : deriveLastMessageMeta(safeParseMessages(doc.messages));
  const unread = Number.isFinite(Number(doc.unread_count)) ? Number(doc.unread_count) : 0;
  const updatedAt = String(doc.updated_at || doc.$updatedAt || '').trim();
  const leadNameFromSnippet = String(leadSnippet?.name || '').trim();
  return {
    id: doc.$id,
    phone_number: String(doc.phone_number || '').trim(),
    updated_at: updatedAt,
    unread_count: unread,
    need_human: humanHandoffIsActive(doc.human_handoff_until),
    human_handoff_until: typeof doc.human_handoff_until === 'string' ? doc.human_handoff_until : '',
    ticket_status: String(doc.ticket_status || 'open').trim() || 'open',
    transfer_to: String(doc.transfer_to || '').trim(),
    lead_id: String(doc.lead_id || leadSnippet?.id || '').trim(),
    lead_name: String(doc.lead_name || '').trim() || leadNameFromSnippet,
    contact_name: String(doc.contact_name || '').trim(),
    contact_name_source: String(doc.contact_name_source || '').trim(),
    whatsapp_profile_name: String(doc.whatsapp_profile_name || '').trim(),
    whatsapp_profile_image_url: String(doc.whatsapp_profile_image_url || '').trim(),
    last_read_at: String(doc.last_read_at || '').trim(),
    last_user_msg_at: String(doc.last_user_msg_at || '').trim(),
    ...meta,
    last_message_timestamp: meta.last_message_timestamp || updatedAt,
    archived: doc.archived === true,
    lead: leadSnippet || null,
  };
}

function matchesSearch(doc, searchRaw) {
  const raw = String(searchRaw || '').trim();
  if (!raw) return true;
  const q = raw.toLowerCase();
  const phoneDigits = String(doc.phone_number || '').replace(/\D/g, '');
  const qDigits = raw.replace(/\D/g, '');
  if (qDigits.length >= 2 && phoneDigits.includes(qDigits)) return true;
  const name = `${String(doc.lead_name || '')} ${String(doc.contact_name || '')}`.toLowerCase();
  return name.includes(q);
}

function ensureJsonBody(req, res) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) {
    res.status(400).json({ sucesso: false, erro: 'Content-Type inválido' });
    return false;
  }
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ sucesso: false, erro: 'Body ausente' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.query.route === 'notes') return conversationNotesHandler(req, res);
  if (req.query.route?.startsWith('notifications')) return notificationsHandler(req, res);
  if (req.query.route === 'message-flags') return messageFlagsHandler(req, res);


  if (!ensureConfig(res)) return;

  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  try {
    await assertBillingActive(academyId);
  } catch (e) {
    if (sendBillingGateError(res, e)) return;
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro interno' });
  }

  const phoneParam = req.query.phone || (Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug);
  const phoneRaw = phoneParam != null ? String(phoneParam).trim() : '';
  const phoneDigits = normalizePhone(phoneRaw);

  /** Lista: GET /api/conversations */
  if (!phoneDigits) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
    }

    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const cursor = String(req.query.cursor || '').trim();
    const search = String(req.query.search || '').trim();
    const searchDigits = normalizePhone(search);
    const archivedOnly =
      String(req.query.archived || '').trim() === '1' || String(req.query.archived || '').trim().toLowerCase() === 'true';
    const statsOnly = String(req.query.stats || '').trim() === '1';

    const listFilterParam = String(req.query.filter || '').trim().toLowerCase();

    if (statsOnly) {
      try {
        const stats = await fetchListStats(academyId, archivedOnly);
        return json(res, 200, stats);
      } catch (e) {
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao carregar estatísticas' });
      }
    }

    const includeStats =
      String(req.query.include_stats || '').trim() === '1' && !search.trim() && !archivedOnly;

    const queries = [Query.equal('academy_id', [academyId])];
    if (archivedOnly) {
      queries.push(Query.equal('archived', [true]));
    } else {
      queries.push(Query.notEqual('archived', [true]));
    }
    appendListFilterQueries(queries, listFilterParam);
    queries.push(Query.orderDesc('updated_at'));
    queries.push(Query.limit(limit + 1));
    if (searchDigits.length >= 2) {
      queries.splice(2, 0, Query.startsWith('phone_number', searchDigits));
    }
    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }

    try {
      const statsPromise = includeStats ? fetchListStats(academyId, archivedOnly) : null;
      const list = await listConversationDocs(queries);
      let docs = list.documents || [];

      if (search.trim() && !searchDigits) {
        const wideQueries = [
          Query.equal('academy_id', [academyId]),
          archivedOnly ? Query.equal('archived', [true]) : Query.notEqual('archived', [true]),
          Query.orderDesc('updated_at'),
          Query.limit(120),
        ];
        appendListFilterQueries(wideQueries, listFilterParam);
        const wide = await listConversationDocs(wideQueries);
        docs = (wide.documents || []).filter((d) => matchesSearch(d, search));
        const page = docs.slice(0, limit);
        const leadByConvId = LEADS_COL
          ? await enrichConversationListDocs(databases, academyId, page)
          : new Map();
        return json(res, 200, {
          items: page.map((doc) => docToListItem(doc, leadByConvId.get(doc.$id) || null)),
          next_cursor: null,
        });
      }

      const hasMore = docs.length > limit;
      const page = hasMore ? docs.slice(0, limit) : docs;
      const next_cursor = hasMore && page.length > 0 ? String(page[page.length - 1].$id) : null;
      const leadByConvId = LEADS_COL
        ? await enrichConversationListDocs(databases, academyId, page)
        : new Map();
      const body = {
        items: page.map((doc) => docToListItem(doc, leadByConvId.get(doc.$id) || null)),
        next_cursor,
      };
      if (statsPromise) {
        body.stats = await statsPromise;
      }
      return json(res, 200, body);
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar conversas' });
    }
  }

  /** Thread + ações: /api/conversations/:phone */
  if (req.method === 'GET') {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const cursor = String(req.query.cursor || '').trim();
    const leadIdQuery = String(req.query.lead_id || '').trim();
    const conversationIdQuery = String(req.query.conversation_id || '').trim();

    try {
      const doc = await getConversationDocForThread(academyId, phoneDigits, {
        leadId: leadIdQuery,
        conversationId: conversationIdQuery,
      });
      if (!doc) {
        return json(res, 200, {
          phone: phoneDigits,
          conversation_id: null,
          archived: false,
          messages: [],
          next_cursor: '',
          summary: null,
          lead_id: null,
          lead_name: '',
          need_human: false,
          human_handoff_until: '',
          ticket_status: 'open',
          transfer_to: '',
        });
      }

      let fullMessagesDoc = null;
      const needsFullMessages =
        threadNeedsFullMessagesFetch(cursor) || !hasUsableMessagesRecent(doc);
      if (needsFullMessages) {
        fullMessagesDoc = await getConversationMessagesDoc(doc.$id, academyId);
      }
      const { slice, next_cursor } = loadThreadMessagesFromDoc(doc, {
        limit,
        cursor,
        fullMessagesDoc,
      });

      if (needsFullMessages && fullMessagesDoc?.messages) {
        waitUntil(
          backfillMessagesRecentFromFull(doc.$id, fullMessagesDoc.messages).catch((e) => {
            console.warn(
              JSON.stringify({
                event: 'messages_recent_backfill_failed',
                conversationId: doc.$id,
                error: e?.message || String(e),
              })
            );
          })
        );
      }

      return json(res, 200, {
        phone: String(doc.phone_number || '').trim() || phoneDigits,
        conversation_id: String(doc.$id || ''),
        archived: doc.archived === true,
        messages: slice,
        next_cursor,
        summary: parseSummaryField(doc.summary),
        lead_id: String(doc.lead_id || '').trim() || null,
        lead_name: String(doc.lead_name || '').trim(),
        contact_name: String(doc.contact_name || '').trim(),
        contact_name_source: String(doc.contact_name_source || '').trim(),
        whatsapp_profile_name: String(doc.whatsapp_profile_name || '').trim(),
        whatsapp_profile_image_url: String(doc.whatsapp_profile_image_url || '').trim(),
        need_human: humanHandoffIsActive(doc.human_handoff_until),
        human_handoff_until: typeof doc.human_handoff_until === 'string' ? doc.human_handoff_until : '',
        ticket_status: String(doc.ticket_status || 'open').trim() || 'open',
        transfer_to: String(doc.transfer_to || '').trim(),
        unread_count: Number.isFinite(Number(doc.unread_count)) ? Number(doc.unread_count) : 0
      });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao carregar conversa' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  }

  if (!ensureJsonBody(req, res)) return;

  const body = req.body || {};
  const action = String(body.action || '').trim();

  try {
    const leadIdBody = String(body.lead_id || '').trim();
    let doc = await findConversationDoc(phoneDigits, academyId, leadIdBody);

    if (action === 'read') {
      if (!doc) return json(res, 200, { ok: true, unread_count: 0 });
      const nowIso = new Date().toISOString();
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { unread_count: 0, last_read_at: nowIso });
      } catch {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { unread_count: 0 });
      }
      return json(res, 200, { ok: true, unread_count: 0, last_read_at: nowIso });
    }

    if (action === 'unread') {
      if (!doc) return json(res, 404, { success: false, sucesso: false, erro: 'Conversa não encontrada' });
      const curUnread = Number.isFinite(Number(doc.unread_count)) ? Number(doc.unread_count) : 0;
      const nextUnread = Math.max(1, curUnread);
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { unread_count: nextUnread });
      return json(res, 200, { success: true, unread_count: nextUnread });
    }

    if (action === 'archive') {
      if (!doc) return json(res, 404, { sucesso: false, erro: 'Conversa não encontrada' });
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { archived: true });
      return json(res, 200, { sucesso: true, archived: true });
    }

    if (action === 'unarchive') {
      if (!doc) return json(res, 404, { sucesso: false, erro: 'Conversa não encontrada' });
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { archived: false });
      return json(res, 200, { sucesso: true, archived: false });
    }

    if (action === 'handoff') {
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return json(res, 500, { sucesso: false, erro: 'Não foi possível abrir conversa' });

      const ativo = Boolean(body.ativo);
      let until = '';
      if (ativo) {
        const h = getHumanHandoffHoursForServer();
        until = humanHandoffUntilFromMs(Date.now() + h * 3600000) || '';
      }
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { human_handoff_until: until });
      const updated = await databases.getDocument(DB_ID, CONVERSATIONS_COL, doc.$id);
      return json(res, 200, {
        need_human: humanHandoffIsActive(updated.human_handoff_until),
        human_handoff_until: String(updated.human_handoff_until || '')
      });
    }

    if (action === 'link_lead') {
      const leadId = String(body.lead_id || '').trim();
      if (!leadId) return json(res, 400, { sucesso: false, erro: 'lead_id ausente' });
      if (!LEADS_COL && !STUDENTS_COL) {
        return json(res, 500, { sucesso: false, erro: 'Coleção de contatos não configurada' });
      }
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return json(res, 500, { sucesso: false, erro: 'Não foi possível abrir conversa' });

      let lead = null;
      if (STUDENTS_COL) {
        try {
          lead = await databases.getDocument(DB_ID, STUDENTS_COL, leadId);
        } catch {
          /* fallback */
        }
      }
      if (!lead && LEADS_COL) {
        lead = await databases.getDocument(DB_ID, LEADS_COL, leadId);
      }
      const leadAcademy = String(lead?.academyId || lead?.academy_id || '').trim();
      if (leadAcademy && leadAcademy !== academyId) {
        return json(res, 403, { sucesso: false, erro: 'Lead de outra academia' });
      }
      const leadName = String(lead?.name || '').trim();
      const payload = { lead_id: leadId };
      if (leadName) payload.lead_name = leadName;
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, payload);
      return json(res, 200, { lead_id: leadId, lead_name: leadName });
    }

    if (action === 'unlink_lead') {
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return json(res, 200, { lead_id: null, lead_name: '' });
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
        lead_id: '',
        lead_name: '',
      });
      return json(res, 200, { lead_id: null, lead_name: '' });
    }

    if (action === 'set_contact_name') {
      const nextName = String(body.contact_name || '').trim();
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return json(res, 500, { sucesso: false, erro: 'Não foi possível abrir conversa' });
      const nowIso = new Date().toISOString();
      const nextSource = nextName ? 'manual' : '';
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
          contact_name: nextName,
          contact_name_source: nextSource,
          contact_name_updated_at: nowIso
        });
      } catch {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
          contact_name: nextName
        });
      }
      const updated = await databases.getDocument(DB_ID, CONVERSATIONS_COL, doc.$id);
      return json(res, 200, {
        sucesso: true,
        contact_name: String(updated?.contact_name || '').trim(),
        contact_name_source: String(updated?.contact_name_source || '').trim() || (nextName ? 'manual' : ''),
        whatsapp_profile_name: String(updated?.whatsapp_profile_name || '').trim()
      });
    }

    if (action === 'rehydrate_media') {
      if (!doc) return json(res, 404, { sucesso: false, erro: 'Conversa não encontrada' });
      const history = safeParseMessages(doc.messages);
      const { messages, attempted, updated } = await rehydrateConversationMediaMessages(history, {
        academyId,
      });
      if (updated > 0) {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
          ...conversationMessagesStoragePayload(messages),
        });
      }
      return json(res, 200, {
        sucesso: true,
        media_attempted: attempted,
        media_rehydrated: updated,
      });
    }

    if (action === 'ticket') {
      const status = String(body.status || '').trim();
      if (!status) return json(res, 400, { sucesso: false, erro: 'status ausente' });
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return json(res, 500, { sucesso: false, erro: 'Não foi possível abrir conversa' });

      const transferTo = body.transfer_to != null ? String(body.transfer_to).trim() : '';
      const payload = { ticket_status: status };
      if (transferTo) payload.transfer_to = transferTo;
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, payload);
      } catch (e) {
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao atualizar ticket' });
      }
      const updated = await databases.getDocument(DB_ID, CONVERSATIONS_COL, doc.$id);
      return json(res, 200, {
        ticket_status: String(updated.ticket_status || status),
        transfer_to: String(updated.transfer_to || '')
      });
    }

    return json(res, 400, { sucesso: false, erro: 'action inválida' });
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro interno' });
  }
}
