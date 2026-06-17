import { LEAD_STATUS } from './leadStatus.js';
import { isStudentRecord, isActiveStudent } from './studentStatus.js';
import { getPaymentRowStatus } from './collectionOverdue.js';
import { buildReceivablesPath, RECEIVABLES_SECTIONS } from './financeiroReceivablesSections.js';
import { FOLLOWUP_AGENDA_MAX_DAYS, getFollowupDaysAgo, getFollowupKind } from './followupState.js';
import { computeFallbackTemperature } from './followupTemperature.js';
import { isTaskDueToday, isTaskOverdue } from './taskDue.js';

function isPendingTask(task) {
  return String(task?.status || '').trim().toLowerCase() !== 'done';
}

/** Conta tarefas pendentes vencidas vs. que vencem hoje. */
export function countTasksDueHub(tasks = []) {
  let overdue = 0;
  let dueToday = 0;
  for (const t of tasks || []) {
    if (!isPendingTask(t)) continue;
    const due = String(t?.due_date || '').trim();
    if (!due) continue;
    if (isTaskOverdue(due)) overdue += 1;
    else if (isTaskDueToday(due)) dueToday += 1;
  }
  return { overdue, dueToday, total: overdue + dueToday };
}

/** Label agregado do hub para tarefas com prazo hoje ou vencidas. */
export function buildTasksDueHubLabel(overdueCount, dueTodayCount) {
  const overdue = Number(overdueCount) || 0;
  const dueToday = Number(dueTodayCount) || 0;
  const total = overdue + dueToday;
  if (total <= 0) return '';

  if (overdue > 0 && dueToday === 0) {
    return overdue === 1 ? '1 tarefa vencida' : `${overdue} tarefas vencidas`;
  }
  if (dueToday > 0 && overdue === 0) {
    return dueToday === 1 ? '1 tarefa vence hoje' : `${dueToday} tarefas vencem hoje`;
  }
  return total === 1
    ? '1 tarefa pendente — vencida ou vence hoje'
    : `${total} tarefas pendentes — vencidas ou vencem hoje`;
}

function tasksDueHubHref(overdueCount, dueTodayCount) {
  if (overdueCount > 0 && dueTodayCount === 0) return '/tarefas?status=vencidas';
  if (dueTodayCount > 0 && overdueCount === 0) return '/tarefas?period=today';
  return '/tarefas?status=vencidas';
}

/** Follow-ups pendentes na agenda (mesma lógica do Dashboard). */
export function countPendingFollowUps(leads = []) {
  let n = 0;
  for (const l of leads) {
    if (String(l?.origin || '').trim() === 'Planilha') continue;
    const kind = getFollowupKind(l);
    if (!kind) continue;
    const daysAgo = getFollowupDaysAgo(l);
    if (daysAgo >= 0 && daysAgo < FOLLOWUP_AGENDA_MAX_DAYS) n += 1;
  }
  return n;
}

/** Estimativa conservadora (sem eventos): leads possivelmente esfriando. */
export function countCoolingFollowUps(leads = []) {
  let n = 0;
  for (const l of leads) {
    if (String(l?.origin || '').trim() === 'Planilha') continue;
    const kind = getFollowupKind(l);
    if (!kind) continue;
    const daysAgo = getFollowupDaysAgo(l);
    if (daysAgo < 0 || daysAgo >= FOLLOWUP_AGENDA_MAX_DAYS) continue;
    const temp = computeFallbackTemperature(l, kind, daysAgo, false);
    if (temp === 'cooling' || temp === 'critical') n += 1;
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

  const { overdue: overdueTasks, dueToday: dueTodayTasks, total: tasksDueTotal } =
    countTasksDueHub(tasks);
  if (tasksDueTotal > 0) {
    items.push({
      id: 'tasks_due',
      label: buildTasksDueHubLabel(overdueTasks, dueTodayTasks),
      href: tasksDueHubHref(overdueTasks, dueTodayTasks),
      count: tasksDueTotal,
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

  const cooling = countCoolingFollowUps(leads);
  if (cooling > 0) {
    items.push({
      id: 'followups_cooling',
      label: cooling === 1 ? '1 follow-up esfriando' : `${cooling} follow-ups esfriando`,
      href: '/?retornos=1',
      count: cooling,
    });
  } else {
    const followUps = countPendingFollowUps(leads);
    if (followUps > 0) {
      items.push({
        id: 'followups',
        label: followUps === 1 ? '1 follow-up pendente' : `${followUps} follow-ups pendentes`,
        href: '/?retornos=1',
        count: followUps,
      });
    }
  }

  return items;
}

export function proactiveHubTotalCount(items) {
  return (items || []).reduce((sum, it) => sum + (Number(it.count) || 0), 0);
}
