import { Client, Databases, Query, ID, Permission, Role } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { ensureConversationBelongsToAcademy } from './ensureConversationInAcademy.js';
import { addLeadEventServer } from './leadEvents.js';

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
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  '';
const CONVERSATION_NOTES_COL =
  process.env.APPWRITE_CONVERSATION_NOTES_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATION_NOTES_COLLECTION_ID ||
  '';
const NOTE_NOTIFICATIONS_COL =
  process.env.APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
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
    res.status(400).json({ sucesso: false, erro: 'Content-Type inv\u00e1lido' });
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
    edited_at: d.edited_at || null,
    edited_by_name: d.edited_by_name || null,
  };
}

export default async function handler(req, res) {
  const method = req.method?.toUpperCase();
  const NOTES_COL =
    process.env.APPWRITE_CONVERSATION_NOTES_COLLECTION_ID ??
    process.env.VITE_APPWRITE_CONVERSATION_NOTES_COLLECTION_ID;
  if (!NOTES_COL || NOTES_COL === 'conversation_notes') {
    console.error(
      '[conversationNotes] ID da collection inválido:',
      NOTES_COL,
      '— configure APPWRITE_CONVERSATION_NOTES_COLLECTION_ID',
      'com o ID real do Appwrite (não o nome)'
    );
  }

  if (!DB_ID) {
    return json(res, 500, { sucesso: false, erro: 'Database n\u00e3o configurado' });
  }

  if (!CONVERSATION_NOTES_COL) {
    if (method === 'GET') {
      return json(res, 200, { sucesso: true, notes: [], configurado: false });
    }
    return json(res, 503, { sucesso: false, erro: 'Cole\u00e7\u00e3o conversation_notes n\u00e3o configurada no servidor' });
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
    if (!conversationId) return json(res, 400, { sucesso: false, erro: 'conversation_id obrigat\u00f3rio' });
    if (academyQ !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inv\u00e1lido' });
    if (!CONVERSATIONS_COL) {
      return json(res, 503, { sucesso: false, erro: 'Cole\u00e7\u00e3o conversations n\u00e3o configurada no servidor' });
    }
    const convOk = await ensureConversationBelongsToAcademy(databases, DB_ID, CONVERSATIONS_COL, conversationId, academyId);
    if (!convOk.ok) {
      return json(res, 403, { sucesso: false, erro: 'Conversa n\u00e3o encontrada nesta academia' });
    }
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
    if (!conversationId) return json(res, 400, { sucesso: false, erro: 'conversation_id obrigat\u00f3rio' });
    if (academyBody !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inv\u00e1lido' });
    if (!body) return json(res, 400, { sucesso: false, erro: 'texto da nota \u00e9 obrigat\u00f3rio' });
    if (body.length > MAX_BODY) {
      return json(res, 400, { sucesso: false, erro: `nota deve ter no m\u00e1ximo ${MAX_BODY} caracteres` });
    }
    if (!CONVERSATIONS_COL) {
      return json(res, 503, { sucesso: false, erro: 'Cole\u00e7\u00e3o conversations n\u00e3o configurada no servidor' });
    }
    const convOkPost = await ensureConversationBelongsToAcademy(databases, DB_ID, CONVERSATIONS_COL, conversationId, academyId);
    if (!convOkPost.ok) {
      return json(res, 403, { sucesso: false, erro: 'Conversa n\u00e3o encontrada nesta academia' });
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

      // PASSO 2: Gravar notificação ao criar nota (fire-and-forget)
      if (NOTE_NOTIFICATIONS_COL) {
        const convDoc = convOkPost.conv || {};
        databases
          .createDocument(
            DB_ID,
            NOTE_NOTIFICATIONS_COL,
            ID.unique(),
            {
              note_id: created.$id,
              conversation_id: conversationId,
              lead_id: String(convDoc.lead_id || '').trim() || null,
              lead_name: String(convDoc.lead_name || '').trim() || null,
              phone_number: String(convDoc.phone_number || '').trim() || null,
              academy_id: academyId,
              created_by_user_id: userId,
              created_by_name: String(me?.name || '').trim() || 'Equipe',
              created_at: nowIso,
              read_by: [userId],
            },
            [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
          )
          .catch((err) => console.error('[conversationNotes] Falha ao gravar notificação:', err?.message));
      }

      // PASSO 3: Espelhar nota na timeline do lead (fire-and-forget)
      try {
        const convDoc = convOkPost.conv || {};
        const leadId = String(convDoc.lead_id || '').trim();
        if (leadId) {
          addLeadEventServer({
            academyId,
            leadId,
            type: 'inbox_note',
            text: body.trim(),
            at: nowIso,
            createdBy: userId,
            payloadJson: {
              source: 'inbox_note',
              note_id: created.$id,
              conversation_id: conversationId
            }
          }).catch(e => console.error('[conversationNotes] Erro ao espelhar na timeline:', e?.message));
        }
      } catch (e) {
        console.error('[conversationNotes] Falha ao preparar espelhamento:', e?.message);
      }

      return json(res, 201, { sucesso: true, note: mapNote(created) });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao criar nota' });
    }
  }
  
  if (method === 'PATCH') {
    const noteId = noteIdFromRequest(req);
    const body = String(req.body.body || '').trim();
    if (!noteId) return json(res, 400, { sucesso: false, erro: 'note_id obrigatório' });
    if (!body) return json(res, 400, { sucesso: false, erro: 'corpo da nota é obrigatório' });
    if (body.length > 2000) return json(res, 400, { sucesso: false, erro: 'nota deve ter no máximo 2000 caracteres' });

    try {
      const doc = await databases.getDocument(DB_ID, CONVERSATION_NOTES_COL, noteId);
      if (String(doc.academy_id || '') !== academyId) {
        return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
      }

      const updated = await databases.updateDocument(DB_ID, CONVERSATION_NOTES_COL, noteId, {
        body,
        edited_at: new Date().toISOString(),
        edited_by: userId,
        edited_by_name: String(me?.name || '').trim() || 'Equipe'
      });

      return json(res, 200, { sucesso: true, note: mapNote(updated) });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao atualizar nota' });
    }
  }


  if (method === 'DELETE') {
    const noteId = noteIdFromRequest(req);
    const academyQ = String(req.query.academy_id || '').trim();
    if (!noteId) return json(res, 400, { sucesso: false, erro: 'note_id obrigat\u00f3rio' });
    if (academyQ !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inv\u00e1lido' });
    try {
      const doc = await databases.getDocument(DB_ID, CONVERSATION_NOTES_COL, noteId).catch(() => null);
      if (!doc || String(doc?.academy_id || '') !== academyId) {
        return json(res, 404, { sucesso: false, erro: 'Nota n\u00e3o encontrada' });
      }
      if (!CONVERSATIONS_COL) {
        return json(res, 503, { sucesso: false, erro: 'Cole\u00e7\u00e3o conversations n\u00e3o configurada no servidor' });
      }
      const convIdDel = String(doc?.conversation_id || '').trim();
      const convOkDel = await ensureConversationBelongsToAcademy(databases, DB_ID, CONVERSATIONS_COL, convIdDel, academyId);
      if (!convOkDel.ok) {
        return json(res, 403, { sucesso: false, erro: 'Conversa n\u00e3o encontrada nesta academia' });
      }
      await databases.deleteDocument(DB_ID, CONVERSATION_NOTES_COL, noteId);
      return json(res, 200, { sucesso: true });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao excluir nota' });
    }
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { sucesso: false, erro: 'M\u00e9todo n\u00e3o permitido' });
}
