import { Client, Databases, Query, ID } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.DB_ID || process.env.VITE_APPWRITE_DATABASE_ID || '';
const TASKS_COL = process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || 'tasks';
const NOTE_NOTIFICATIONS_COL = process.env.APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID || 'note_notifications';
const CRON_SECRET = process.env.CRON_SECRET || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  }

  const authHeader = req.headers.authorization || '';
  const querySecret = req.query.secret || '';
  const token = authHeader.replace('Bearer ', '').trim() || querySecret;

  if (!CRON_SECRET || token !== CRON_SECRET) {
    return json(res, 401, { sucesso: false, erro: 'Não autorizado' });
  }

  if (!DB_ID || !TASKS_COL || !NOTE_NOTIFICATIONS_COL) {
    return json(res, 500, { sucesso: false, erro: 'Configurações de banco de dados ausentes' });
  }

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Busca todas as tarefas pendentes
    // Limitamos para evitar timeout, mas podemos fazer paginação se necessário
    const tasksRes = await databases.listDocuments(DB_ID, TASKS_COL, [
      Query.equal('status', 'pending'),
      Query.limit(500)
    ]);

    const pendingTasks = tasksRes.documents || [];
    let notifiedCount = 0;
    const nowIso = new Date().toISOString();

    for (const task of pendingTasks) {
      const dueDate = String(task.due_date || '').trim();
      const assignedTo = String(task.assigned_to || '').trim();

      // Ignora se não tem data de vencimento ou não tem responsável
      if (!dueDate || !assignedTo) continue;

      // Verifica se a tarefa está vencida ou vence hoje (due_date <= hoje)
      const taskDateOnly = dueDate.split('T')[0];
      if (taskDateOnly > todayStr) continue;

      // Verifica duplicata de notificação
      const notifRes = await databases.listDocuments(DB_ID, NOTE_NOTIFICATIONS_COL, [
        Query.equal('note_id', task.$id),
        Query.equal('type', 'task_due'),
        Query.limit(1)
      ]);

      if (notifRes.documents && notifRes.documents.length > 0) {
        // Já foi notificado
        continue;
      }

      // Cria notificação
      await databases.createDocument(DB_ID, NOTE_NOTIFICATIONS_COL, ID.unique(), {
        academy_id: task.academy_id,
        type: 'task_due',
        note_id: task.$id,
        conversation_id: '',
        lead_id: task.lead_id || '',
        lead_name: task.lead_name || '',
        created_by_user_id: assignedTo,
        created_by_name: 'Sistema',
        created_at: nowIso,
        read_by: []
      });

      notifiedCount++;
    }

    return json(res, 200, { sucesso: true, notified: notifiedCount });
  } catch (error) {
    console.error('[cron/tasks-due] Erro ao processar:', error);
    return json(res, 500, { sucesso: false, erro: error.message });
  }
}
