import { Client, Databases, Query, ID, Permission, Role } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import { addLeadEventServer } from '../lib/server/leadEvents.js';
import taskTemplatesHandler from '../lib/server/taskTemplatesHandler.js';
import { taskDescriptionForAppwrite } from '../src/lib/stockInventory.js';
import { respondApiError } from '../lib/server/friendlyError.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.DB_ID || process.env.VITE_APPWRITE_DATABASE_ID || '';
const TASKS_COL =
  process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '';
const NOTE_NOTIFICATIONS_COL =
  process.env.APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
  '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

function ensureJsonBody(req, res) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) {
    json(res, 400, { sucesso: false, erro: 'Content-Type inválido' });
    return false;
  }
  if (!req.body || typeof req.body !== 'object') {
    json(res, 400, { sucesso: false, erro: 'Body ausente' });
    return false;
  }
  return true;
}

function taskIdFromRequest(req) {
  const q = String(req.query?.id || req.query?.task_id || '').trim();
  if (q) return q;
  const url = String(req.url || '');
  const m = url.match(/\/api\/tasks\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function mapTask(d) {
  return {
    id: d.$id,
    academy_id: String(d.academy_id || ''),
    title: String(d.title || ''),
    description: String(d.description || ''),
    status: String(d.status || ''),
    due_date: d.due_date ? String(d.due_date) : '',
    assigned_to: d.assigned_to ? String(d.assigned_to) : '',
    lead_id: d.lead_id ? String(d.lead_id) : '',
    lead_name: d.lead_name ? String(d.lead_name) : '',
    created_by: d.created_by ? String(d.created_by) : '',
    created_at: String(d.created_at || d.$createdAt || ''),
    updated_at: String(d.updated_at || d.$updatedAt || ''),
    template_id: d.template_id ? String(d.template_id) : '',
    template_batch_id: d.template_batch_id ? String(d.template_batch_id) : '',
    template_name: d.template_name ? String(d.template_name) : '',
  };
}

function isDueValue(value) {
  if (!value) return false;
  const s = String(value).trim();
  if (!s) return false;
  const t = Date.parse(s.length === 10 ? `${s}T00:00:00.000Z` : s);
  return Number.isFinite(t);
}

function dueSortKey(value) {
  if (!isDueValue(value)) return Number.POSITIVE_INFINITY;
  const s = String(value).trim();
  const t = Date.parse(s.length === 10 ? `${s}T00:00:00.000Z` : s);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

export default async function handler(req, res) {
  if (req.query.route === 'task-templates') return taskTemplatesHandler(req, res);

  const method = req.method?.toUpperCase();

  if (!DB_ID) return json(res, 500, { sucesso: false, erro: 'Database não configurado' });
  if (!TASKS_COL) {
    if (method === 'GET') return json(res, 200, { sucesso: true, tasks: [], configurado: false });
    return json(res, 503, { sucesso: false, erro: 'Coleção tasks não configurada no servidor' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  if (method === 'GET') {
    const academyQ = String(req.query.academy_id || '').trim();
    if (!academyQ) return json(res, 400, { sucesso: false, erro: 'academy_id obrigatório' });
    if (academyQ !== academyId) return json(res, 400, { sucesso: false, erro: 'academy_id inválido' });

    const status = String(req.query.status || '').trim();
    const assignedTo = String(req.query.assigned_to || '').trim();
    const leadId = String(req.query.lead_id || '').trim();
    const cursor = String(req.query.cursor || '').trim();
    const limitRaw = Number(req.query.limit);
    const pageLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 50;

    try {
      const queries = [
        Query.equal('academy_id', [academyId]),
        Query.orderDesc('$createdAt'),
        Query.limit(pageLimit),
      ];
      if (status && status !== 'all') queries.push(Query.equal('status', [status]));
      if (assignedTo) queries.push(Query.equal('assigned_to', [assignedTo]));
      if (leadId) queries.push(Query.equal('lead_id', [leadId]));
      if (cursor) queries.push(Query.cursorAfter(cursor));

      const list = await databases.listDocuments(DB_ID, TASKS_COL, queries);
      const docs = Array.isArray(list?.documents) ? list.documents : [];
      const tasks = docs.map(mapTask).sort((a, b) => dueSortKey(a.due_date) - dueSortKey(b.due_date));
      const lastId = docs.length ? docs[docs.length - 1].$id : null;
      const pageFull = docs.length === pageLimit;

      return json(res, 200, {
        sucesso: true,
        tasks,
        next_cursor: pageFull && lastId ? lastId : null,
        has_more: pageFull && Boolean(lastId),
      });
    } catch (e) {
      console.error('[tasks] Erro ao listar:', e);
      return respondApiError(res, e, { tag: 'tasks/list', context: 'load', jsonFn: json });
    }
  }

  if (method === 'POST') {
    if (!ensureJsonBody(req, res)) return;

    const title = String(req.body.title || '').trim();
    if (!title) return json(res, 400, { sucesso: false, erro: 'title obrigatório' });

    const nowIso = new Date().toISOString();
    const payload = {
      academy_id: academyId,
      title,
      description: taskDescriptionForAppwrite(req.body.description),
      status: String(req.body.status || 'pending'),
      due_date: String(req.body.due_date || ''),
      assigned_to: String(req.body.assigned_to || ''),
      lead_id: String(req.body.lead_id || ''),
      lead_name: String(req.body.lead_name || ''),
      created_by: String(req.body.created_by || ''),
      created_at: nowIso,
      updated_at: nowIso,
    };

    const tplId = String(req.body.template_id || '').trim();
    const tplBatch = String(req.body.template_batch_id || '').trim();
    const tplName = String(req.body.template_name || '').trim();
    if (tplId) payload.template_id = tplId;
    if (tplBatch) payload.template_batch_id = tplBatch;
    if (tplName) payload.template_name = tplName.slice(0, 128);

    if (!payload.created_by) {
      return json(res, 400, { sucesso: false, erro: 'created_by obrigatório' });
    }

    try {
      let doc;
      try {
        doc = await databases.createDocument(DB_ID, TASKS_COL, ID.unique(), payload, [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
        ]);
      } catch (createErr) {
        const msg = String(createErr?.message || '');
        if (msg.includes('Unknown attribute') && (tplId || tplBatch || tplName)) {
          delete payload.template_id;
          delete payload.template_batch_id;
          delete payload.template_name;
          doc = await databases.createDocument(DB_ID, TASKS_COL, ID.unique(), payload, [
            Permission.read(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
          ]);
        } else {
          throw createErr;
        }
      }

      if (
        NOTE_NOTIFICATIONS_COL &&
        String(payload.assigned_to || '').trim() &&
        String(payload.assigned_to || '').trim() !== String(payload.created_by || '').trim()
      ) {
        try {
          const createdByName = String(req.body.created_by_name || me?.name || '').trim();
          await databases.createDocument(DB_ID, NOTE_NOTIFICATIONS_COL, ID.unique(), {
            academy_id: academyId,
            type: 'task_assigned',
            note_id: doc.$id,
            conversation_id: '',
            lead_id: payload.lead_id || '',
            lead_name: payload.lead_name || '',
            created_by_user_id: payload.created_by,
            created_by_name: createdByName,
            created_at: nowIso,
            read_by: [],
          });
        } catch (e) {
          console.warn('[tasks] Falha ao criar notificação de atribuição:', e?.message || e);
        }
      }

      const leadIdForTimeline = String(payload.lead_id || '').trim();
      if (leadIdForTimeline) {
        try {
          const duePtBr = String(payload.due_date || '').trim()
            ? new Date(`${String(payload.due_date).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')
            : '';
          const timelineText =
            `Tarefa criada: ${payload.title}` + (duePtBr ? ` · prazo ${duePtBr}` : '');
          await addLeadEventServer({
            academyId,
            leadId: leadIdForTimeline,
            type: 'task_created',
            text: timelineText,
            createdBy: String(payload.created_by || me?.$id || 'user'),
            payloadJson: {
              task_id: String(doc?.$id || ''),
              title: String(payload.title || ''),
              due_date: String(payload.due_date || ''),
              assigned_to: String(payload.assigned_to || ''),
            },
          });
        } catch (e) {
          console.warn('[tasks] Falha ao registrar evento na timeline:', e?.message || e);
        }
      }

      return json(res, 201, { sucesso: true, task: mapTask(doc) });
    } catch (e) {
      console.error('[tasks] Erro ao criar:', e);
      return respondApiError(res, e, { tag: 'tasks/create', context: 'save', jsonFn: json });
    }
  }

  if (method === 'PATCH') {
    if (!ensureJsonBody(req, res)) return;
    const taskId = taskIdFromRequest(req);
    if (!taskId) return json(res, 400, { sucesso: false, erro: 'id obrigatório' });

    const patch = { ...(req.body || {}) };
    delete patch.academy_id;
    delete patch.created_by;
    delete patch.updated_at;

    const keys = Object.keys(patch);
    if (keys.length === 0) return json(res, 400, { sucesso: false, erro: 'Nenhum campo para atualizar' });

    patch.updated_at = new Date().toISOString();

    try {
      const current = await databases.getDocument(DB_ID, TASKS_COL, taskId);
      if (String(current?.academy_id || '') !== academyId) {
        return json(res, 403, { sucesso: false, erro: 'Tarefa não encontrada nesta academia' });
      }

      const updated = await databases.updateDocument(DB_ID, TASKS_COL, taskId, patch);

      const prevStatus = String(current?.status || '').trim().toLowerCase();
      const nextStatus = String(updated?.status || '').trim().toLowerCase();
      const leadIdForTimeline = String(updated?.lead_id || current?.lead_id || '').trim();
      if (leadIdForTimeline && prevStatus !== 'done' && nextStatus === 'done') {
        try {
          await addLeadEventServer({
            academyId,
            leadId: leadIdForTimeline,
            type: 'task_done',
            text: `Tarefa concluída: ${String(updated?.title || current?.title || 'Sem título')}`.slice(0, 1000),
            createdBy: String(me?.$id || 'user'),
            payloadJson: {
              task_id: String(updated?.$id || current?.$id || ''),
              title: String(updated?.title || current?.title || ''),
              completed_at: new Date().toISOString(),
            },
          });
        } catch (e) {
          console.warn('[tasks] Falha ao registrar conclusão na timeline:', e?.message || e);
        }
      }

      return json(res, 200, { sucesso: true, task: mapTask(updated) });
    } catch (e) {
      console.error('[tasks] Erro ao atualizar:', e);
      return respondApiError(res, e, { tag: 'tasks/update', context: 'save', jsonFn: json });
    }
  }

  if (method === 'DELETE') {
    const taskId = taskIdFromRequest(req);
    if (!taskId) return json(res, 400, { sucesso: false, erro: 'id obrigatório' });
    try {
      const current = await databases.getDocument(DB_ID, TASKS_COL, taskId);
      if (String(current?.academy_id || '') !== academyId) {
        return json(res, 403, { sucesso: false, erro: 'Tarefa não encontrada nesta academia' });
      }
      await databases.deleteDocument(DB_ID, TASKS_COL, taskId);
      return json(res, 200, { sucesso: true });
    } catch (e) {
      console.error('[tasks] Erro ao excluir:', e);
      return respondApiError(res, e, { tag: 'tasks/delete', context: 'save', jsonFn: json });
    }
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
