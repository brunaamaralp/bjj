import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';
import { AGENT_HISTORY_WINDOW } from '../constants.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const appwriteClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = appwriteClient ? new Databases(appwriteClient) : null;

export function safeParseMessages(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeConversationMessages(existing, additions) {
  const out = Array.isArray(existing) ? existing.slice() : [];
  const hasUserById = new Set(out.filter((m) => m?.role === 'user' && m?.message_id).map((m) => String(m.message_id)));
  const hasAssistantByReply = new Set(
    out.filter((m) => m?.role === 'assistant' && m?.in_reply_to).map((m) => String(m.in_reply_to))
  );

  for (const a of additions || []) {
    if (!a || typeof a !== 'object') continue;
    if (a.role === 'user' && a.message_id) {
      const id = String(a.message_id);
      if (hasUserById.has(id)) continue;
      hasUserById.add(id);
    }
    if (a.role === 'assistant' && a.in_reply_to) {
      const rid = String(a.in_reply_to);
      if (hasAssistantByReply.has(rid)) continue;
      hasAssistantByReply.add(rid);
    }
    out.push(a);
  }
  return out.slice(-AGENT_HISTORY_WINDOW);
}

function permissionsForAcademyDoc(academyDoc) {
  const ownerId = String(academyDoc?.ownerId || '').trim();
  const teamId = String(academyDoc?.teamId || '').trim();
  const perms = [];
  if (ownerId) perms.push(Permission.read(Role.user(ownerId)), Permission.update(Role.user(ownerId)), Permission.delete(Role.user(ownerId)));
  if (teamId) perms.push(Permission.read(Role.team(teamId)), Permission.update(Role.team(teamId)), Permission.delete(Role.team(teamId)));
  if (perms.length > 0) return perms;
  return [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
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

export async function findConversationDoc(phone, academyId) {
  const a = String(academyId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !a) return null;
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('phone_number', [phone]),
    Query.equal('academy_id', [a]),
    Query.limit(1),
  ]);
  return list.documents && list.documents[0] ? list.documents[0] : null;
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
    return { ok: false, erro: e?.message || 'Erro ao atualizar ciclo da thread' };
  }
}

export async function getOrCreateConversationDoc(phone, academyId, academyDoc) {
  const a = String(academyId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !a) return null;
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('phone_number', [phone]),
    Query.equal('academy_id', [a]),
    Query.limit(1)
  ]);
  const existing = list.documents && list.documents[0] ? list.documents[0] : null;
  if (existing) return existing;

  const nowIso = new Date().toISOString();
  return databases.createDocument(
    DB_ID,
    CONVERSATIONS_COL,
    ID.unique(),
    {
      phone_number: phone,
      messages: JSON.stringify([]),
      updated_at: nowIso,
      academy_id: a,
      archived: false
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
    return { ok: false, erro: e?.message || 'update_failed' };
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
        messages: JSON.stringify(merged),
        updated_at: nowIso
      };
      if (userAdds > 0) {
        payload.unread_count = prevUnread + userAdds;
        payload.last_user_msg_at = nowIso;
        if (current.archived === true) payload.archived = false;
      }
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, payload);
      } catch {
        const minimal = { messages: payload.messages, updated_at: payload.updated_at };
        if (userAdds > 0 && current.archived === true) minimal.archived = false;
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, minimal);
      }
      return { ok: true };
    } catch (e) {
      lastErr = e?.message || 'Erro ao atualizar conversa';
    }
  }
  return { ok: false, erro: lastErr || 'Erro ao atualizar conversa' };
}
