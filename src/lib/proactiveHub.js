import { LEAD_STATUS } from './leadStatus.js';
import { isStudentRecord, isActiveStudent } from './studentStatus.js';
import { getPaymentRowStatus } from './collectionOverdue.js';
import { buildReceivablesPath, RECEIVABLES_SECTIONS } from './financeiroReceivablesSections.js';

const FOLLOWUP_AGENDA_MAX_DAYS = 7;

function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isTaskDueTodayOrOverdue(task) {
  const due = String(task?.due_date || '').trim().slice(0, 10);
  if (!due) return false;
  return due <= ymdToday();
}

/** Follow-ups pendentes na agenda (mesma lógica do Dashboard). */
export function countPendingFollowUps(leads = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let n = 0;
  for (const l of leads) {
    if (String(l?.origin || '').trim() === 'Planilha') continue;
    if (l.status !== LEAD_STATUS.COMPLETED && l.status !== LEAD_STATUS.MISSED) continue;
    const classDate = l.scheduledDate ? new Date(`${l.scheduledDate}T00:00:00`) : new Date(l.createdAt);
    const daysAgo = Math.floor((today - classDate) / 86400000);
    if (daysAgo >= 0 && daysAgo < FOLLOWUP_AGENDA_MAX_DAYS) n += 1;
  }
  return n;
}

/** Estimativa local (sem API de pagamentos): vencimento calendário > 1 dia. */
export function countOverduePayments(leads = [], financeConfig) {
  if (!financeConfig?.plans?.length) return 0;
  const month = new Date().toISOString().slice(0, 7);
  const today = new Date();
  let n = 0;
  for (const s of leads) {
    if (!isStudentRecord(s) || !isActiveStudent(s)) continue;
    if (!String(s.plan || '').trim()) continue;
    const row = getPaymentRowStatus(s, null, month, today);
    if (row.status === 'pending' && Number(row.daysOverdue) > 1) n += 1;
  }
  return n;
}

/**
 * @returns {{ id: string, label: string, href: string, count: number }[]}
 */
export function buildProactiveHubItems({ tasks = [], leads = [], modules = {}, financeConfig = null }) {
  const items = [];

  const tasksDue = (tasks || []).filter(
    (t) => String(t?.status || '').trim().toLowerCase() !== 'done' && isTaskDueTodayOrOverdue(t)
  );
  if (tasksDue.length > 0) {
    items.push({
      id: 'tasks_due',
      label: tasksDue.length === 1 ? '1 tarefa vence hoje' : `${tasksDue.length} tarefas vencem hoje`,
      href: '/tarefas?period=today',
      count: tasksDue.length,
    });
  }

  if (modules.finance) {
    const overdue = countOverduePayments(leads, financeConfig);
    if (overdue > 0) {
      items.push({
        id: 'payments_overdue',
        label: overdue === 1 ? '1 pagamento em atraso' : `${overdue} pagamentos em atraso`,
        href: buildReceivablesPath({
          section: RECEIVABLES_SECTIONS.MENSALIDADES,
          filtro: 'pending',
        }),
        count: overdue,
      });
    }
  }

  const followUps = countPendingFollowUps(leads);
  if (followUps > 0) {
    items.push({
      id: 'followups',
      label: followUps === 1 ? '1 follow-up pendente' : `${followUps} follow-ups pendentes`,
      href: '/#follow-ups',
      count: followUps,
    });
  }

  return items;
}

export function proactiveHubTotalCount(items) {
  return (items || []).reduce((sum, it) => sum + (Number(it.count) || 0), 0);
}
