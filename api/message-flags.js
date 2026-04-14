import { Client, Databases, Query, ID, Permission, Role } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';

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
const MESSAGE_FLAGS_COL =
  process.env.APPWRITE_MESSAGE_FLAGS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_MESSAGE_FLAGS_COLLECTION_ID ||
  '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
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
  const method = req.method?.toUpperCase();

  if (!MESSAGE_FLAGS_COL || !DB_ID) {
    return json(res, 500, { sucesso: false, erro: 'MESSAGE_FLAGS_COL / DB não configurados' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const messageIdParam = String(req.query.message_id || '').trim();

  if (method === 'GET') {
    const conversationId = String(req.query.conversation_id || '').trim();
    const academyQ = String(req.query.academy_id || '').trim();
    if (!conversationId) return json(res, 400, { sucesso: false, erro: 'conversation_id obrigatório' });
    if (academyQ !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inválido' });
    try {
      const list = await databases.listDocuments(DB_ID, MESSAGE_FLAGS_COL, [
        Query.equal('academy_id', [academyId]),
        Query.equal('conversation_id', [conversationId]),
        Query.limit(500),
      ]);
      const flags = (list.documents || []).map((d) => ({
        $id: d.$id,
        conversation_id: String(d.conversation_id || ''),
        message_id: String(d.message_id || ''),
        academy_id: String(d.academy_id || ''),
        type: String(d.type || ''),
        created_at: String(d.created_at || d.$createdAt || ''),
      }));
      return json(res, 200, { sucesso: true, flags });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar flags' });
    }
  }

  if (method === 'POST') {
    if (!ensureJsonBody(req, res)) return;
    const conversationId = String(req.body.conversation_id || '').trim();
    const messageId = String(req.body.message_id || '').trim();
    const academyBody = String(req.body.academy_id || '').trim();
    const type = String(req.body.type || '').trim();
    if (!conversationId) return json(res, 400, { sucesso: false, erro: 'conversation_id obrigatório' });
    if (!messageId) return json(res, 400, { sucesso: false, erro: 'message_id obrigatório' });
    if (academyBody !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inválido' });
    if (type !== 'pinned' && type !== 'important') {
      return json(res, 400, { sucesso: false, erro: 'type deve ser pinned ou important' });
    }
    try {
      const existing = await databases.listDocuments(DB_ID, MESSAGE_FLAGS_COL, [
        Query.equal('academy_id', [academyId]),
        Query.equal('conversation_id', [conversationId]),
        Query.equal('message_id', [messageId]),
        Query.equal('type', [type]),
        Query.limit(1),
      ]);
      const doc0 = existing.documents?.[0];
      if (doc0) {
        return json(res, 200, {
          sucesso: true,
          flag: {
            $id: doc0.$id,
            conversation_id: String(doc0.conversation_id || ''),
            message_id: String(doc0.message_id || ''),
            academy_id: String(doc0.academy_id || ''),
            type: String(doc0.type || ''),
            created_at: String(doc0.created_at || doc0.$createdAt || ''),
          },
          existed: true,
        });
      }
      const nowIso = new Date().toISOString();
      const created = await databases.createDocument(
        DB_ID,
        MESSAGE_FLAGS_COL,
        ID.unique(),
        {
          academy_id: academyId,
          conversation_id: conversationId,
          message_id: messageId,
          type,
          created_at: nowIso,
        },
        [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
      );
      return json(res, 201, {
        sucesso: true,
        flag: {
          $id: created.$id,
          conversation_id: String(created.conversation_id || ''),
          message_id: String(created.message_id || ''),
          academy_id: String(created.academy_id || ''),
          type: String(created.type || ''),
          created_at: String(created.created_at || created.$createdAt || ''),
        },
        existed: false,
      });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao criar flag' });
    }
  }

  if (method === 'DELETE') {
    if (!messageIdParam) return json(res, 400, { sucesso: false, erro: 'message_id obrigatório' });
    const type = String(req.query.type || '').trim();
    const academyQ = String(req.query.academy_id || '').trim();
    const conversationId = String(req.query.conversation_id || '').trim();
    if (type !== 'pinned' && type !== 'important') {
      return json(res, 400, { sucesso: false, erro: 'type deve ser pinned ou important' });
    }
    if (academyQ !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inválido' });
    if (!conversationId) return json(res, 400, { sucesso: false, erro: 'conversation_id obrigatório' });
    try {
      const list = await databases.listDocuments(DB_ID, MESSAGE_FLAGS_COL, [
        Query.equal('academy_id', [academyId]),
        Query.equal('conversation_id', [conversationId]),
        Query.equal('message_id', [messageIdParam]),
        Query.equal('type', [type]),
        Query.limit(5),
      ]);
      const docs = list.documents || [];
      for (const d of docs) {
        await databases.deleteDocument(DB_ID, MESSAGE_FLAGS_COL, d.$id);
      }
      return json(res, 200, { sucesso: true });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao remover flag' });
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
