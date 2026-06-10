import { apiErro, logApiError } from './friendlyError.js';
import { timingSafeEqual } from 'crypto';
import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { createInternalNotification } from './internalNotification.js';

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

function safeCompare(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function isInternalNotificationRequest(req) {
  const expected = String(process.env.INTERNAL_API_SECRET || '').trim();
  const provided = String(req.headers['x-internal-secret'] || '').trim();
  return expected.length > 0 && provided.length > 0 && safeCompare(provided, expected);
}

function mapNotificationDoc(d) {
  const type = String(d?.type || '').trim();
  const isSystem = type.startsWith('whatsapp_') || type === 'agent_send_failed' || type === 'inbound_persist_failed';
  return {
    id: d.$id,
    note_id: d.note_id,
    conversation_id: d.conversation_id,
    lead_id: d.lead_id,
    lead_name: d.lead_name,
    phone_number: d.phone_number,
    created_by_name: d.created_by_name,
    created_at: d.created_at,
    type: type || null,
    title: isSystem ? String(d.lead_name || '').trim() : null,
    body: isSystem ? String(d.created_by_name || '').trim() : null,
    action_url: String(d?.action_url || '').trim() || null,
    severity: String(d?.severity || '').trim() || null,
    is_system: isSystem
  };
}

export default async function notificationsHandler(req, res) {
  const method = req.method?.toUpperCase();
  const route = String(req.query.route || '').trim();

  if (!NOTE_NOTIFICATIONS_COL || !DB_ID || !API_KEY) {
    return json(res, 500, { sucesso: false, erro: 'Configuração Appwrite de notificações ausente' });
  }

  if (method === 'POST' && route === 'notifications') {
    if (!isInternalNotificationRequest(req)) {
      return json(res, 401, { sucesso: false, erro: 'Não autorizado' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const academyId = String(body.academy_id || body.academyId || '').trim();
    if (!academyId) {
      return json(res, 400, { sucesso: false, erro: 'academy_id ausente' });
    }
    const created = await createInternalNotification({
      academy_id: academyId,
      type: String(body.type || '').trim(),
      title: String(body.title || '').trim(),
      body: String(body.body || '').trim(),
      action_url: String(body.action_url || '').trim(),
      severity: String(body.severity || 'info').trim(),
      phone: String(body.phone || body.phone_number || '').trim(),
      conversation_id: String(body.conversation_id || '').trim()
    });
    if (!created.ok) {
      return json(res, 500, { sucesso: false, erro: created.erro || 'Falha ao criar notificação' });
    }
    return json(res, 200, { sucesso: true, id: created.id });
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
        notifications: filtered.map((d) => mapNotificationDoc(d)),
        unreadCount: filtered.length
      });
    } catch (e) {
      console.error('[notifications] Erro ao listar:', e);
      return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
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
      return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
    }
  }

  return json(res, 400, { sucesso: false, erro: 'Rota de notificação inválida' });
}
