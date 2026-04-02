import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';

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
  return out.slice(-50);
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
      academy_id: a
    },
    permissionsForAcademyDoc(academyDoc)
  );
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
      }
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, payload);
      } catch {
        const minimal = { messages: payload.messages, updated_at: payload.updated_at };
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, minimal);
      }
      return { ok: true };
    } catch (e) {
      lastErr = e?.message || 'Erro ao atualizar conversa';
    }
  }
  return { ok: false, erro: lastErr || 'Erro ao atualizar conversa' };
}
