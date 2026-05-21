/**
 * Cron: tarefa semanal de conferência + alertas de estoque mínimo (backup).
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import {
  STOCK_WEEKLY_CHECK_MARKER,
  isStockWeeklyCheckTask,
} from '../../src/lib/stockInventory.js';
import {
  academyHasInventoryModule,
  nextOccurrenceYmd,
  parseAcademySettings,
  readStockCheckSchedule,
} from '../../src/lib/stockSettings.js';
import { ensureRestockTasksForAcademy } from './inventoryMoveHandler.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const TASKS_COL = process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '';
const STOCK_ITEMS_COL =
  process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || process.env.STOCK_ITEMS_COL || '';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function utcDayOfWeek() {
  return new Date().getUTCDay();
}

async function listAcademyOpenTasks(databases, dbId, academyId) {
  if (!TASKS_COL) return [];
  const res = await databases.listDocuments(dbId, TASKS_COL, [
    Query.equal('academy_id', academyId),
    Query.equal('status', 'pending'),
    Query.limit(200),
  ]);
  return res.documents || [];
}

async function processAcademyWeeklyCheck(databases, dbId, academyDoc) {
  const academyId = academyDoc.$id;
  if (!academyHasInventoryModule(academyDoc)) return { skipped: 'inventory_module_off' };
  if (!TASKS_COL) return { skipped: 'tasks_not_configured' };

  const settings = parseAcademySettings(academyDoc.settings);
  const schedule = readStockCheckSchedule(settings);
  if (!schedule.enabled) return { skipped: 'schedule_disabled' };

  const todayDow = utcDayOfWeek();
  if todayDow !== schedule.dayOfWeek) {
    return { skipped: 'not_scheduled_day', dayOfWeek: schedule.dayOfWeek, todayDow };
  }

  const dueDate = nextOccurrenceYmd(schedule.dayOfWeek);
  const openTasks = await listAcademyOpenTasks(databases, dbId, academyId);
  const exists = openTasks.some(
    (t) => isStockWeeklyCheckTask(t, schedule.taskTitle) && String(t.due_date || '').slice(0, 10) === dueDate
  );
  if (exists) return { weeklyCreated: 0, skipped: 'duplicate' };

  const description = `${STOCK_WEEKLY_CHECK_MARKER}\nConferir saldos e registrar entradas/saídas conforme necessário.`;

  await databases.createDocument(
    dbId,
    TASKS_COL,
    ID.unique(),
    {
      academy_id: academyId,
      title: schedule.taskTitle,
      description,
      status: 'pending',
      due_date: dueDate,
      assigned_to: '',
      lead_id: '',
      lead_name: '',
      created_by: 'system',
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
  );

  return { weeklyCreated: 1 };
}

export async function runStockInventoryCron(databases, dbId) {
  if (!dbId || !ACADEMIES_COL) {
    return { processed: 0, error: 'misconfigured' };
  }

  const PAGE = 40;
  let processed = 0;
  let weeklyCreated = 0;
  let restockCreated = 0;
  let restockUpdated = 0;
  let lastId = null;
  const t0 = Date.now();
  const MAX_MS = 50000;

  while (Date.now() - t0 < MAX_MS) {
    const queries = [Query.limit(PAGE), Query.orderAsc('$id')];
    if (lastId) queries.push(Query.cursorAfter(lastId));
    const page = await databases.listDocuments(dbId, ACADEMIES_COL, queries);
    const docs = page.documents || [];
    if (!docs.length) break;

    for (const doc of docs) {
      if (!academyHasInventoryModule(doc)) continue;
      try {
        const weekly = await processAcademyWeeklyCheck(databases, dbId, doc);
        if (weekly.weeklyCreated) weeklyCreated += weekly.weeklyCreated;

        if (STOCK_ITEMS_COL) {
          const restock = await ensureRestockTasksForAcademy(databases, dbId, doc.$id, STOCK_ITEMS_COL);
          restockCreated += restock.created || 0;
          restockUpdated += restock.updated || 0;
        }
        processed += 1;
      } catch (e) {
        console.error('[cron/stock-inventory] academy', doc.$id, e?.message || e);
      }
    }
    lastId = docs[docs.length - 1].$id;
    if (docs.length < PAGE) break;
  }

  return { processed, weeklyCreated, restockCreated, restockUpdated };
}
