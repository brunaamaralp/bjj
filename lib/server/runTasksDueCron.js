/**
 * Cron diário: notifica responsável quando tarefa pending vence (due_date <= hoje).
 */
import { Query, ID } from 'node-appwrite';

function getTasksDueConfig() {
  return {
    tasksCol:
      process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '',
    notifCol:
      process.env.APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
      process.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
      '',
    academiesCol:
      process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID ||
      process.env.APPWRITE_ACADEMIES_COLLECTION_ID ||
      '',
  };
}

const TASKS_PAGE = 100;
const ACADEMIES_PAGE = 40;

/** @param {string} dueDate @param {string} todayStr YYYY-MM-DD */
export function isTaskDueForNotification(dueDate, todayStr) {
  const raw = String(dueDate || '').trim();
  if (!raw) return false;
  return raw.split('T')[0] <= todayStr;
}

/** @param {string} academyId @param {string | null} [cursor] */
export function buildTasksDueQueries(academyId, cursor = null) {
  const queries = [
    Query.equal('academy_id', [String(academyId || '').trim()]),
    Query.equal('status', ['pending']),
    Query.limit(TASKS_PAGE),
  ];
  if (cursor) queries.push(Query.cursorAfter(cursor));
  return queries;
}

/**
 * Processa tarefas vencidas de uma academia.
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {{ todayStr?: string; nowIso?: string; maxMs?: number }} [opts]
 */
export async function processTasksDueForAcademy(databases, dbId, academyId, opts = {}) {
  const { tasksCol, notifCol } = getTasksDueConfig();
  const aid = String(academyId || '').trim();
  if (!dbId || !tasksCol || !notifCol || !aid) {
    return { academyId: aid, tasksScanned: 0, notified: 0, skipped: true };
  }

  const todayStr = opts.todayStr || new Date().toISOString().split('T')[0];
  const nowIso = opts.nowIso || new Date().toISOString();
  const maxMs = Number.isFinite(Number(opts.maxMs)) ? Number(opts.maxMs) : 15000;
  let tasksScanned = 0;
  let notified = 0;
  let cursor = null;
  const t0 = Date.now();

  while (Date.now() - t0 < maxMs) {
    const tasksRes = await databases.listDocuments(dbId, tasksCol, buildTasksDueQueries(aid, cursor));
    const batch = tasksRes.documents || [];
    if (!batch.length) break;

    for (const task of batch) {
      tasksScanned += 1;
      const dueDate = String(task.due_date || '').trim();
      const assignedTo = String(task.assigned_to || '').trim();
      if (!dueDate || !assignedTo) continue;
      if (!isTaskDueForNotification(dueDate, todayStr)) continue;

      const notifRes = await databases.listDocuments(dbId, notifCol, [
        Query.equal('note_id', task.$id),
        Query.equal('type', 'task_due'),
        Query.limit(1),
      ]);
      if (notifRes.documents?.length) continue;

      await databases.createDocument(dbId, notifCol, ID.unique(), {
        academy_id: task.academy_id || aid,
        type: 'task_due',
        note_id: task.$id,
        conversation_id: '',
        lead_id: task.lead_id || '',
        lead_name: task.lead_name || '',
        created_by_user_id: assignedTo,
        created_by_name: 'Sistema',
        created_at: nowIso,
        read_by: [],
      });
      notified += 1;
    }

    cursor = batch[batch.length - 1]?.$id || null;
    if (batch.length < TASKS_PAGE) break;
  }

  return { academyId: aid, tasksScanned, notified };
}

/**
 * Itera academias e notifica tarefas vencidas por tenant.
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 */
export async function runTasksDue(databases, dbId) {
  const { tasksCol, notifCol, academiesCol } = getTasksDueConfig();
  if (!dbId || !tasksCol || !notifCol || !academiesCol) {
    return { sucesso: false, erro: 'Configurações de banco de dados ausentes' };
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();
  let notified = 0;
  let tasksScanned = 0;
  let academiesProcessed = 0;
  const byAcademy = [];
  let lastId = null;
  const t0 = Date.now();
  const MAX_MS = 50000;

  while (Date.now() - t0 < MAX_MS) {
    const queries = [Query.limit(ACADEMIES_PAGE), Query.orderAsc('$id')];
    if (lastId) queries.push(Query.cursorAfter(lastId));
    const page = await databases.listDocuments(dbId, academiesCol, queries);
    const docs = page.documents || [];
    if (!docs.length) break;

    for (const doc of docs) {
      academiesProcessed += 1;
      try {
        const out = await processTasksDueForAcademy(databases, dbId, doc.$id, {
          todayStr,
          nowIso,
          maxMs: 8000,
        });
        tasksScanned += out.tasksScanned || 0;
        notified += out.notified || 0;
        const row = {
          academyId: doc.$id,
          tasksScanned: out.tasksScanned || 0,
          notified: out.notified || 0,
        };
        byAcademy.push(row);
        console.log('[cron/tasks-due]', row);
      } catch (e) {
        console.error('[cron/tasks-due] academy', doc.$id, e?.message || e);
        byAcademy.push({ academyId: doc.$id, tasksScanned: 0, notified: 0, error: true });
      }
    }

    lastId = docs[docs.length - 1]?.$id || null;
    if (docs.length < ACADEMIES_PAGE) break;
  }

  return { sucesso: true, notified, tasksScanned, academiesProcessed, byAcademy };
}
