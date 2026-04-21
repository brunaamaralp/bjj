import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const NOTE_NOTIFICATIONS_COL = process.env.APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

export default async function notificationsHandler(req, res) {
  const method = req.method?.toUpperCase();
  const route = String(req.query.route || '').trim();

  if (!NOTE_NOTIFICATIONS_COL || !DB_ID || !API_KEY) {
    return json(res, 500, { sucesso: false, erro: 'Configuração Appwrite de notificações ausente' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;
  const userId = String(me?.$id || '').trim();

  // GET ?route=notifications&academy_id=X&user_id=Y
  if (method === 'GET' && route === 'notifications') {
    const academyQ = String(req.query.academy_id || '').trim();
    if (academyQ !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inválido' });

    try {
      const resDocs = await databases.listDocuments(DB_ID, NOTE_NOTIFICATIONS_COL, [
        Query.equal('academy_id', [academyId]),
        Query.orderDesc('created_at'),
        Query.limit(50) // Buscamos mais para filtrar no servidor
      ]);

      const filtered = resDocs.documents
        .filter(d => {
          const readers = Array.isArray(d.read_by) ? d.read_by : [];
          return !readers.includes(userId);
        })
        .slice(0, 20);

      return json(res, 200, {
        sucesso: true,
        notifications: filtered.map(d => ({
          id: d.$id,
          note_id: d.note_id,
          conversation_id: d.conversation_id,
          lead_id: d.lead_id,
          lead_name: d.lead_name,
          phone_number: d.phone_number,
          created_by_name: d.created_by_name,
          created_at: d.created_at
        })),
        unreadCount: filtered.length
      });
    } catch (e) {
      console.error('[notifications] Erro ao listar:', e);
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao buscar notificações' });
    }
  }

  // PATCH ?route=notifications/read
  if (method === 'PATCH' && route === 'notifications/read') {
    const ids = Array.isArray(req.body.notification_ids) ? req.body.notification_ids : [];
    const bodyUserId = String(req.body.user_id || '').trim();

    if (!ids.length) return json(res, 200, { sucesso: true });
    if (bodyUserId !== userId) return json(res, 403, { sucesso: false, erro: 'user_id divergente' });

    try {
      await Promise.all(ids.map(async (id) => {
        try {
          const doc = await databases.getDocument(DB_ID, NOTE_NOTIFICATIONS_COL, id);
          if (doc.academy_id !== academyId) return;
          
          const currentReadBy = Array.isArray(doc.read_by) ? doc.read_by : [];
          if (!currentReadBy.includes(userId)) {
            await databases.updateDocument(DB_ID, NOTE_NOTIFICATIONS_COL, id, {
              read_by: [...currentReadBy, userId]
            });
          }
        } catch (err) {
          console.warn(`[notifications] Erro ao marcar ${id} como lida:`, err.message);
        }
      }));

      return json(res, 200, { sucesso: true });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao marcar as notificações como lidas' });
    }
  }

  return json(res, 400, { sucesso: false, erro: 'Rota de notificação inválida' });
}
