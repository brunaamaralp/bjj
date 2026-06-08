/**
 * Cron diário: tarefas da régua de cobrança.
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import { addLeadEventServer } from './leadEvents.js';
import {
  readCollectionSettingsFromAcademy,
  buildCollectionTaskTitle,
  buildCollectionTaskDescription,
  academyHasFinanceModule,
  applyNamePlaceholder,
  isCollectionSnoozed,
} from '../../src/lib/collectionRules.js';
import {
  getPaymentRowStatus,
  isOverdueForCollection,
} from '../../src/lib/collectionOverdue.js';
import {
  markStudentOverdueIfUnset,
  clearStudentOverdueIfSet,
  hasOpenOverduePayments,
  listAllPaymentsForLead,
  todayYmdUtc,
} from './studentOverdueSync.js';
import { listAcademyStudentDocs } from './listAcademyStudents.js';

const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const PEOPLE_COL = STUDENTS_COL || LEADS_COL;
const TASKS_COL = process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '';
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID || process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function isActiveStudentLead(doc) {
  if (STUDENTS_COL) {
    const s = String(doc?.student_status || '').trim().toLowerCase();
    return s !== 'inactive';
  }
  const isStudent =
    String(doc?.status || '').trim() === 'Matriculado' ||
    String(doc?.contact_type || '').trim() === 'student';
  if (!isStudent) return false;
  const s = String(doc?.student_status || '').trim().toLowerCase();
  return s !== 'inactive';
}

function parseFinanceConfig(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthYmd() {
  return new Date().toISOString().slice(0, 7);
}

function parseCollectionTaskDay(description) {
  const m = String(description || '').match(/^day:\s*(\d+)/m);
  return m ? Math.trunc(Number(m[1])) : null;
}

/** Uma tarefa por etapa (day) por aluno — aberta ou já concluída neste ciclo. */
function hasCollectionTaskForDay(tasks, leadId, ruleDay) {
  return (tasks || []).some((t) => {
    if (String(t.lead_id || '') !== String(leadId)) return false;
    if (!String(t.description || '').includes('[collection_rule]')) return false;
    return parseCollectionTaskDay(t.description) === ruleDay;
  });
}

async function listAllPaymentsForMonth(databases, dbId, academyId, referenceMonth) {
  if (!PAYMENTS_COL) return [];
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (;;) {
    const queries = [
      Query.equal('academy_id', academyId),
      Query.equal('reference_month', referenceMonth),
      Query.limit(PAGE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, PAYMENTS_COL, queries);
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return all;
}

async function listAcademyTasks(databases, dbId, academyId) {
  if (!TASKS_COL) return [];
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (;;) {
    const queries = [Query.equal('academy_id', academyId), Query.limit(PAGE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, TASKS_COL, queries);
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return all;
}


function mapLeadFromDoc(doc) {
  return {
    id: doc.$id,
    name: doc.name || doc.lead_name || '',
    dueDay: doc.due_day ?? doc.dueDay,
    plan: doc.plan || '',
    studentStatus: doc.student_status,
    status: doc.status,
    contact_type: doc.contact_type,
  };
}

async function processAcademy(databases, dbId, academyDoc) {
  const academyId = academyDoc.$id;
  if (!academyHasFinanceModule(academyDoc)) {
    return { skipped: 'finance_module_off' };
  }
  if (!PEOPLE_COL || !PAYMENTS_COL) {
    return { skipped: 'collections_not_configured' };
  }

  const { collectionRules } = readCollectionSettingsFromAcademy(academyDoc);
  const financeConfig = parseFinanceConfig(academyDoc.financeConfig);
  const ownerId = String(academyDoc.ownerId || '').trim();
  const month = currentMonthYmd();
  const ymd = todayYmd();

  const [leadsRaw, payments, tasks] = await Promise.all([
    listAcademyStudentDocs(academyId),
    listAllPaymentsForMonth(databases, dbId, academyId, month),
    listAcademyTasks(databases, dbId, academyId),
  ]);

  const paymentByLead = {};
  for (const p of payments) {
    if (String(p.status || '').toLowerCase() === 'cancelled') continue;
    const lid = String(p.lead_id || '').trim();
    if (!lid) continue;
    const cur = paymentByLead[lid];
    if (!cur || p.status === 'paid') paymentByLead[lid] = p;
    else if (cur.status !== 'paid') paymentByLead[lid] = p;
  }

  let tasksCreated = 0;
  let escalations = 0;
  let overdueMarked = 0;
  let overdueCleared = 0;

  for (const doc of leadsRaw) {
    if (!isActiveStudentLead(doc)) continue;

    const student = mapLeadFromDoc(doc);
    const payment = paymentByLead[student.id] || null;
    const payStatus = String(payment?.status || '').toLowerCase();
    if (payStatus === 'awaiting') continue;
    if (isCollectionSnoozed(doc, month)) continue;

    const row = getPaymentRowStatus(student, payment, month);
    const overdue = isOverdueForCollection(student, payment, month, 1);

    if (overdue) {
      try {
        const markOut = await markStudentOverdueIfUnset(
          databases,
          dbId,
          doc,
          financeConfig,
          PEOPLE_COL
        );
        if (markOut.updated) overdueMarked += 1;
      } catch (e) {
        console.error('[cron/collection-overdue] mark overdue', student.id, e?.message || e);
      }

      const daysOverdue = row.daysOverdue;
      for (const rule of collectionRules) {
        if (daysOverdue < rule.day) continue;
        if (hasCollectionTaskForDay(tasks, student.id, rule.day)) continue;

        const leadName = String(doc.name || doc.lead_name || '').trim() || 'Aluno';
        const title = buildCollectionTaskTitle(rule, leadName);
        const description = buildCollectionTaskDescription(
          { ...rule, defaultMessage: applyNamePlaceholder(rule.defaultMessage, leadName) },
          leadName
        );
        const assignedTo = rule.escalate && ownerId ? ownerId : '';
        const createdBy = rule.escalate && ownerId ? ownerId : 'system';

        if (TASKS_COL) {
          const taskDoc = await databases.createDocument(
            dbId,
            TASKS_COL,
            ID.unique(),
            {
              academy_id: academyId,
              title,
              description,
              status: 'pending',
              due_date: ymd,
              assigned_to: assignedTo,
              lead_id: student.id,
              lead_name: leadName,
              created_by: createdBy,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
          );
          tasks.push(taskDoc);
          tasksCreated += 1;
        }

        if (rule.escalate) {
          escalations += 1;
          const datePt = new Date().toLocaleDateString('pt-BR');
          await addLeadEventServer({
            academyId,
            leadId: student.id,
            type: 'collection_escalated',
            text: `Cobrança escalada para responsável em ${datePt}`,
            createdBy: 'system',
            payloadJson: { stage: rule.label, day: rule.day, at: new Date().toISOString() },
          });
        }
      }
    } else {
      try {
        const allPayments = await listAllPaymentsForLead(databases, dbId, academyId, student.id);
        const stillOpen = hasOpenOverduePayments(allPayments, todayYmdUtc());
        if (!stillOpen) {
          const clearOut = await clearStudentOverdueIfSet(databases, dbId, doc, PEOPLE_COL);
          if (clearOut.updated) overdueCleared += 1;
        }
      } catch (e) {
        console.error('[cron/collection-overdue] clear overdue', student.id, e?.message || e);
      }
    }
  }

  return { tasksCreated, escalations, overdueMarked, overdueCleared };
}

export async function runCollectionOverdue(databases, dbId) {
  if (!dbId || !ACADEMIES_COL) {
    return { processed: 0, error: 'misconfigured' };
  }

  const PAGE = 40;
  let processed = 0;
  let totals = { tasksCreated: 0, escalations: 0, overdueMarked: 0, overdueCleared: 0 };
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
      try {
        const out = await processAcademy(databases, dbId, doc);
        if (!out?.skipped) processed += 1;
        totals.tasksCreated += out.tasksCreated || 0;
        totals.escalations += out.escalations || 0;
        totals.overdueMarked += out.overdueMarked || 0;
        totals.overdueCleared += out.overdueCleared || 0;
      } catch (e) {
        console.error('[cron/collection-overdue] academy', doc.$id, e?.message || e);
      }
    }

    lastId = docs[docs.length - 1].$id;
    if (docs.length < PAGE) break;
  }

  return { processed, ...totals };
}
