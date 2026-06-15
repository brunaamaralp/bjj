import { Query } from 'node-appwrite';

/** YYYY-MM-DD no fuso local — alinhado a isTaskOverdue (due_date armazenado como data). */
export function localTodayYmd(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Monta queries Appwrite para listagem paginada de tarefas.
 * @param {{ academyId: string, status?: string, assignedTo?: string, leadId?: string, overdue?: boolean, cursor?: string, pageLimit?: number, todayYmd?: string }} params
 */
export function buildTasksListQueries(params) {
  const academyId = String(params.academyId || '').trim();
  const status = String(params.status || '').trim();
  const assignedTo = String(params.assignedTo || '').trim();
  const leadId = String(params.leadId || '').trim();
  const overdue = Boolean(params.overdue);
  const cursor = String(params.cursor || '').trim();
  const pageLimit = Number.isFinite(Number(params.pageLimit)) && Number(params.pageLimit) > 0
    ? Math.min(Math.trunc(Number(params.pageLimit)), 100)
    : 50;
  const todayYmd = String(params.todayYmd || localTodayYmd()).trim();

  const queries = [
    Query.equal('academy_id', [academyId]),
    Query.orderDesc('$createdAt'),
    Query.limit(pageLimit),
  ];

  if (overdue) {
    queries.push(Query.equal('status', ['pending']));
    queries.push(Query.lessThan('due_date', todayYmd));
  } else if (status && status !== 'all') {
    queries.push(Query.equal('status', [status]));
  }

  if (assignedTo) queries.push(Query.equal('assigned_to', [assignedTo]));
  if (leadId) queries.push(Query.equal('lead_id', [leadId]));
  if (cursor) queries.push(Query.cursorAfter(cursor));

  return queries;
}
