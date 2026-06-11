import { apiErro, logApiError } from './friendlyError.js';
import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';
import { AGENT_HISTORY_WINDOW, CONVERSATION_MESSAGES_STORE_MAX } from '../constants.js';
import { lastMessageMetaPayload } from './conversationListMeta.js';
import { conversationMessagesStoragePayload, buildMessagesRecentPayload } from './conversationMessages.js';
import {
  inboxPhoneLookupVariants,
  inboxPhonesMatch,
  primaryInboxPhone,
} from '../../src/lib/normalizeInboxPhone.js';

export const THREAD_SELECT_ATTRS = [
  '$id',
  'academy_id',
  'phone_number',
  'messages_recent',
  'summary',
  'lead_id',
  'lead_name',
  'contact_name',
  'contact_name_source',
  'whatsapp_profile_name',
  'whatsapp_profile_image_url',
  'human_handoff_until',
  'ticket_status',
  'transfer_to',
  'archived',
  'unread_count',
];

const THREAD_MESSAGES_SELECT_ATTRS = ['$id', 'academy_id', 'messages'];

/**
 * Contrato de "nova mensagem" na conversa (fonte de verdade para badge e notificações):
 * - unread_count: contador na lista (zera via POST read, webhook message.read / message.sent whatsapp)
 * - last_user_msg_at: última mensagem do cliente (notificação desktop / destaque)
 * - updated_at: ordenação e atividade na lista
 * Campos last_preview / last_message_role são derivados só para exibição — não usar para contagem.
 */

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const appwriteClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = appwriteClient ? new Databases(appwriteClient) : null;

export const AGENT_STATE_MAX_BYTES = 4096;

export function safeParseMessages(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {object|string|null|undefined} raw */
export function readAgentState(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {object} state */
export function stringifyAgentState(state) {
  const obj = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  let s = JSON.stringify(obj);
  if (s.length > AGENT_STATE_MAX_BYTES) {
    const trimmed = { ...obj };
    delete trimmed.intake;
    s = JSON.stringify(trimmed);
  }
  if (s.length > AGENT_STATE_MAX_BYTES) return '{}';
  return s;
}

export async function writeAgentState(docId, state) {
  const id = String(docId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !id) return { ok: false, erro: 'ids inválidos' };
  try {
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, id, {
      agent_state: stringifyAgentState(state),
    });
    return { ok: true };
  } catch (e) {
    const msg = String(e?.message || '');
    if (/unknown attribute|agent_state/i.test(msg)) {
      return { ok: false, erro: 'agent_state_attr_missing' };
    }
    return { ok: false, erro: apiErro(e, 'save') };
  }
}

function mergeConversationMessages(existing, additions) {
  const out = Array.isArray(existing) ? existing.slice() : [];
  const hasUserById = new Set(out.filter((m) => m?.role === 'user' && m?.message_id).map((m) => String(m.message_id)));
  const hasAssistantById = new Set(
    out.filter((m) => m?.role === 'assistant' && m?.message_id).map((m) => String(m.message_id))
  );
  const hasAssistantByReply = new Set(
    out.filter((m) => m?.role === 'assistant' && m?.in_reply_to).map((m) => String(m.in_reply_to))
  );

  for (const a of additions || []) {
    if (!a || typeof a !== 'object') continue;
    if (a.role === 'user' && a.message_id) {
      const id = String(a.message_id);
      if (hasUserById.has(id)) continue;
    }
    if (a.role === 'assistant' && a.message_id) {
      const id = String(a.message_id);
      if (hasAssistantById.has(id)) continue;
    }
    if (a.role === 'assistant' && a.in_reply_to) {
      const rid = String(a.in_reply_to);
      if (hasAssistantByReply.has(rid)) continue;
    }
    out.push(a);
    if (a.role === 'user' && a.message_id) hasUserById.add(String(a.message_id));
    if (a.role === 'assistant' && a.message_id) hasAssistantById.add(String(a.message_id));
    if (a.role === 'assistant' && a.in_reply_to) hasAssistantByReply.add(String(a.in_reply_to));
  }
  const cap = Math.max(AGENT_HISTORY_WINDOW, CONVERSATION_MESSAGES_STORE_MAX);
  return out.slice(-cap);
}

/**
 * Conta mensagens inbound (role user) após last_read_at.
 * @param {Array} messages
 * @param {string | null | undefined} lastReadAt ISO timestamp
 */
export function recalcUnreadCount(messages, lastReadAt) {
  const msgs = Array.isArray(messages) ? messages : [];
  const lastReadRaw = String(lastReadAt || '').trim();
  if (!lastReadRaw) {
    return msgs.filter((m) => m && m.role === 'user').length;
  }
  const lastReadMs = Date.parse(lastReadRaw);
  if (!Number.isFinite(lastReadMs)) {
    return msgs.filter((m) => m && m.role === 'user').length;
  }
  let count = 0;
  for (const m of msgs) {
    if (!m || m.role !== 'user') continue;
    const ts = m.timestamp ? Date.parse(String(m.timestamp)) : NaN;
    if (!Number.isFinite(ts) || ts > lastReadMs) count++;
  }
  return count;
}

/**
 * unread após merge/reconcile — evita reabrir conversas já lidas quando last_read_at não foi persistido.
 * @param {{ messages: Array, lastReadAt?: string, prevUnread?: number, historyMessages?: Array }} opts
 */
export function resolveUnreadCountAfterMerge({ messages, lastReadAt, prevUnread, historyMessages }) {
  const merged = Array.isArray(messages) ? messages : [];
  const lastReadRaw = String(lastReadAt || '').trim();
  if (lastReadRaw) {
    return recalcUnreadCount(merged, lastReadRaw);
  }

  const prev = Number.isFinite(Number(prevUnread)) ? Number(prevUnread) : 0;
  if (prev <= 0) {
    const history = Array.isArray(historyMessages) ? historyMessages : [];
    const knownUserIds = new Set(
      history.filter((m) => m?.role === 'user' && m?.message_id).map((m) => String(m.message_id))
    );
    let added = 0;
    for (const m of merged) {
      if (!m || m.role !== 'user') continue;
      const mid = String(m?.message_id || '').trim();
      if (!mid || knownUserIds.has(mid)) continue;
      added++;
    }
    return added;
  }

  return recalcUnreadCount(merged, null);
}

export async function clearConversationUnread(docId) {
  const id = String(docId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !id) return { ok: false, erro: 'ids inválidos' };
  const nowIso = new Date().toISOString();
  try {
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, id, {
      unread_count: 0,
      last_read_at: nowIso,
    });
    return { ok: true, last_read_at: nowIso };
  } catch (e) {
    try {
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, id, { unread_count: 0 });
      return { ok: true };
    } catch (e2) {
      return { ok: false, erro: apiErro(e2 || e, 'save') };
    }
  }
}

function permissionsForAcademyDoc(academyDoc) {
  const ownerId = String(academyDoc?.ownerId || '').trim();
  const teamId = String(academyDoc?.teamId || '').trim();
  const perms = [];
  if (ownerId) perms.push(Permission.read(Role.user(ownerId)), Permission.update(Role.user(ownerId)), Permission.delete(Role.user(ownerId)));
  if (teamId) perms.push(Permission.read(Role.team(teamId)), Permission.update(Role.team(teamId)), Permission.delete(Role.team(teamId)));
  if (perms.length > 0) return perms;
  // Sem fallback Role.users() — conversas restritas a owner + team da academia.
  return perms;
}

export async function getAcademyDocument(academyId) {
  const id = String(academyId || '').trim();
  if (!databases || !DB_ID || !ACADEMIES_COL || !id) return null;
  try {
    return await databases.getDocument(DB_ID, ACADEMIES_COL, id);
  } catch {
    return null;
  }
}

function normalizeFindOpts(optsOrLeadId = '') {
  if (typeof optsOrLeadId === 'object' && optsOrLeadId !== null) {
    return {
      leadId: String(optsOrLeadId.leadId || '').trim(),
      conversationId: String(optsOrLeadId.conversationId || '').trim(),
      selectAttrs: Array.isArray(optsOrLeadId.selectAttrs) ? optsOrLeadId.selectAttrs : null,
    };
  }
  return { leadId: String(optsOrLeadId || '').trim(), conversationId: '', selectAttrs: null };
}

async function listConversationByQueries(queries, selectAttrs) {
  const q = selectAttrs?.length ? [...queries, Query.select(selectAttrs)] : queries;
  try {
    return await databases.listDocuments(DB_ID, CONVERSATIONS_COL, q);
  } catch {
    if (selectAttrs?.length) {
      return await databases.listDocuments(DB_ID, CONVERSATIONS_COL, queries);
    }
    throw new Error('list failed');
  }
}

/**
 * @param {string} phoneDigits
 * @param {string} academyId
 * @param {string | { leadId?: string, conversationId?: string, selectAttrs?: string[] }} [optsOrLeadId]
 */
export async function findConversationDoc(phoneDigits, academyId, optsOrLeadId = '') {
  const a = String(academyId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !a) return null;
  const { leadId, conversationId, selectAttrs } = normalizeFindOpts(optsOrLeadId);

  const cid = String(conversationId || '').trim();
  if (cid) {
    const byId = await listConversationByQueries(
      [Query.equal('$id', [cid]), Query.equal('academy_id', [a]), Query.limit(1)],
      selectAttrs
    );
    const doc = byId.documents?.[0] || null;
    if (!doc) return null;
    const phone = String(phoneDigits || '').trim();
    if (phone && doc.phone_number && !inboxPhonesMatch(phone, doc.phone_number)) return null;
    return doc;
  }

  const canonical = primaryInboxPhone(phoneDigits);
  const tried = new Set();

  if (canonical) {
    tried.add(canonical);
    const list = await listConversationByQueries(
      [Query.equal('academy_id', [a]), Query.equal('phone_number', [canonical]), Query.limit(1)],
      selectAttrs
    );
    const doc = list.documents?.[0] || null;
    if (doc) return doc;
  }

  const variants = inboxPhoneLookupVariants(phoneDigits);
  for (const p of variants) {
    if (!p || tried.has(p)) continue;
    tried.add(p);
    const list = await listConversationByQueries(
      [Query.equal('academy_id', [a]), Query.equal('phone_number', [p]), Query.limit(1)],
      selectAttrs
    );
    const doc = list.documents?.[0] || null;
    if (doc) return doc;
  }

  if (leadId) {
    const byLead = await listConversationByQueries(
      [Query.equal('academy_id', [a]), Query.equal('lead_id', [leadId]), Query.limit(1)],
      selectAttrs
    );
    return byLead.documents?.[0] || null;
  }
  return null;
}

/** Doc leve para GET thread (sem `messages` nem `agent_state`). */
export async function getConversationDocForThread(academyId, phoneDigits, opts = {}) {
  return findConversationDoc(phoneDigits, academyId, {
    ...opts,
    selectAttrs: THREAD_SELECT_ATTRS,
  });
}

/** Carrega só o campo `messages` para paginação de histórico antigo. */
export async function getConversationMessagesDoc(docId, academyId) {
  const id = String(docId || '').trim();
  const a = String(academyId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !id || !a) return null;
  const list = await listConversationByQueries(
    [Query.equal('$id', [id]), Query.equal('academy_id', [a]), Query.limit(1)],
    THREAD_MESSAGES_SELECT_ATTRS
  );
  return list.documents?.[0] || null;
}

export async function getConversationDocById(docId) {
  const id = String(docId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !id) return null;
  try {
    return await databases.getDocument(DB_ID, CONVERSATIONS_COL, id);
  } catch {
    return null;
  }
}

export async function updateConversationAiThreadCycle(convId, cycleId) {
  const id = String(convId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !id) return { ok: false, erro: 'conv_id inválido' };
  try {
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, id, {
      ai_thread_cycle_id: String(cycleId || ''),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: apiErro(e, 'save') };
  }
}

export async function getOrCreateConversationDoc(phone, academyId, academyDoc) {
  const a = String(academyId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !a) return null;
  const canonical = primaryInboxPhone(phone) || String(phone || '').trim();
  const existing = await findConversationDoc(canonical, a);
  if (existing) return existing;

  const nowIso = new Date().toISOString();
  const emptyMessages = JSON.stringify([]);
  return databases.createDocument(
    DB_ID,
    CONVERSATIONS_COL,
    ID.unique(),
    {
      phone_number: canonical,
      messages: emptyMessages,
      messages_recent: emptyMessages,
      updated_at: nowIso,
      academy_id: a,
      archived: false,
    },
    permissionsForAcademyDoc(academyDoc)
  );
}

/**
 * Metadados de falha de dispatch (ex.: INTERNAL_API_SECRET ausente).
 * Requer atributos opcionais `last_dispatch_error` e `last_dispatch_at` na coleção de conversas, se quiser persistir.
 */
export async function updateConversationLastDispatchMeta(phone, academyId, { code, at }) {
  const p = String(phone || '').trim();
  const a = String(academyId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !p || !a) return { ok: false, erro: 'config ou ids inválidos' };
  const doc = await findConversationDoc(p, a);
  if (!doc?.$id) return { ok: false, erro: 'conversa_nao_encontrada' };
  try {
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
      last_dispatch_error: String(code || ''),
      last_dispatch_at: String(at || new Date().toISOString())
    });
    return { ok: true };
  } catch (e) {
    console.warn('[conversationsStore] updateConversationLastDispatchMeta falhou (verifique atributos no Appwrite)', {
      erro: e?.message || String(e)
    });
    return { ok: false, erro: apiErro(e, 'action') };
  }
}

export async function updateConversationWithMerge(docId, additions) {
  if (!databases || !DB_ID || !CONVERSATIONS_COL) return { ok: false, erro: 'Config Appwrite inválida' };
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const current = await databases.getDocument(DB_ID, CONVERSATIONS_COL, docId);
      const history = safeParseMessages(current.messages);
      const merged = mergeConversationMessages(history, additions);
      const nowIso = new Date().toISOString();
      const userAdds = Array.isArray(additions) ? additions.filter((a) => a && a.role === 'user').length : 0;
      const prevUnread = Number.isFinite(Number(current?.unread_count)) ? Number(current.unread_count) : 0;
      const payload = {
        ...conversationMessagesStoragePayload(merged),
        updated_at: nowIso,
        ...lastMessageMetaPayload(merged),
      };
      if (userAdds > 0) {
        payload.unread_count = prevUnread + userAdds;
        payload.last_user_msg_at = nowIso;
        if (current.archived === true) payload.archived = false;
      }
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, payload);
      } catch {
        const minimal = {
          messages: payload.messages,
          messages_recent: payload.messages_recent,
          updated_at: payload.updated_at,
        };
        if (userAdds > 0 && current.archived === true) minimal.archived = false;
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, minimal);
      }
      return { ok: true };
    } catch (e) {
      lastErr = apiErro(e, 'save');
    }
  }
  return { ok: false, erro: lastErr || apiErro(null, 'save') };
}

/**
 * Preenche messages_recent (e metadados da lista) a partir do histórico completo.
 * Usado em conversas legadas e após leitura lenta do thread.
 */
export async function backfillMessagesRecentFromFull(docId, messagesRaw) {
  const id = String(docId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !id) {
    return { ok: false, erro: 'config_ou_id_invalido' };
  }
  const merged = safeParseMessages(messagesRaw);
  if (merged.length === 0) return { ok: false, skipped: true };

  const payload = {
    messages_recent: buildMessagesRecentPayload(merged),
    ...lastMessageMetaPayload(merged),
  };

  try {
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, id, payload);
    return { ok: true };
  } catch (e) {
    try {
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, id, {
        messages_recent: payload.messages_recent,
      });
      return { ok: true, partial: true };
    } catch (e2) {
      return { ok: false, erro: apiErro(e2 || e, 'save') };
    }
  }
}
