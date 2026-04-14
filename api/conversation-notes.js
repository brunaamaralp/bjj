import { Client, Databases, Query, ID, Permission, Role } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './_lib/academyAccess.js';

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
const CONVERSATION_NOTES_COL =
  process.env.APPWRITE_CONVERSATION_NOTES_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATION_NOTES_COLLECTION_ID ||
  '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

const MAX_BODY = 4000;

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

function noteIdFromRequest(req) {
  const q = String(req.query?.note_id || req.query?.id || '').trim();
  if (q) return q;
  const url = String(req.url || '');
  const m = url.match(/\/api\/conversation-notes\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function mapNote(d) {
  return {
    $id: d.$id,
    conversation_id: String(d.conversation_id || ''),
    academy_id: String(d.academy_id || ''),
    body: String(d.body || ''),
    author_id: String(d.author_id || ''),
    created_at: String(d.created_at || d.$createdAt || ''),
  };
}

export default async function handler(req, res) {
  const method = req.method?.toUpperCase();

  if (!DB_ID) {
    return json(res, 500, { sucesso: false, erro: 'Database não configurado' });
  }

  if (!CONVERSATION_NOTES_COL) {
    if (method === 'GET') {
      return json(res, 200, { sucesso: true, notes: [], configurado: false });
    }
    return json(res, 503, { sucesso: false, erro: 'Coleção conversation_notes não configurada no servidor' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;
  const userId = String(me?.$id || '').trim();

  if (method === 'GET') {
    const conversationId = String(req.query.conversation_id || '').trim();
    const academyQ = String(req.query.academy_id || '').trim();
    if (!conversationId) return json(res, 400, { sucesso: false, erro: 'conversation_id obrigatório' });
    if (academyQ !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inválido' });
    try {
      const list = await databases.listDocuments(DB_ID, CONVERSATION_NOTES_COL, [
        Query.equal('academy_id', [academyId]),
        Query.equal('conversation_id', [conversationId]),
        Query.limit(100),
      ]);
      const docs = [...(list.documents || [])].sort((a, b) => {
        const ta = new Date(a.created_at || a.$createdAt || 0).getTime();
        const tb = new Date(b.created_at || b.$createdAt || 0).getTime();
        return tb - ta;
      });
      const notes = docs.map(mapNote);
      return json(res, 200, { sucesso: true, notes, configurado: true });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar notas' });
    }
  }

  if (method === 'POST') {
    if (!ensureJsonBody(req, res)) return;
    const conversationId = String(req.body.conversation_id || '').trim();
    const academyBody = String(req.body.academy_id || '').trim();
    const body = String(req.body.body || '').trim();
    if (!conversationId) return json(res, 400, { sucesso: false, erro: 'conversation_id obrigatório' });
    if (academyBody !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inválido' });
    if (!body) return json(res, 400, { sucesso: false, erro: 'texto da nota é obrigatório' });
    if (body.length > MAX_BODY) {
      return json(res, 400, { sucesso: false, erro: `nota deve ter no máximo ${MAX_BODY} caracteres` });
    }
    const nowIso = new Date().toISOString();
    try {
      const created = await databases.createDocument(
        DB_ID,
        CONVERSATION_NOTES_COL,
        ID.unique(),
        {
          academy_id: academyId,
          conversation_id: conversationId,
          body,
          author_id: userId,
          created_at: nowIso,
        },
        [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
      );
      return json(res, 201, { sucesso: true, note: mapNote(created) });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao criar nota' });
    }
  }

  if (method === 'DELETE') {
    const noteId = noteIdFromRequest(req);
    const academyQ = String(req.query.academy_id || '').trim();
    if (!noteId) return json(res, 400, { sucesso: false, erro: 'note_id obrigatório' });
    if (academyQ !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inválido' });
    try {
      const doc = await databases.getDocument(DB_ID, CONVERSATION_NOTES_COL, noteId).catch(() => null);
      if (!doc || String(doc?.academy_id || '') !== academyId) {
        return json(res, 404, { sucesso: false, erro: 'Nota não encontrada' });
      }
      await databases.deleteDocument(DB_ID, CONVERSATION_NOTES_COL, noteId);
      return json(res, 200, { sucesso: true });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao excluir nota' });
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
