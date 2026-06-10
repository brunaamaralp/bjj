import { LEAD_STATUS } from './leadStatus.js';
import { isStudentRecord, isActiveStudent } from './studentStatus.js';
import { getPaymentRowStatus } from './collectionOverdue.js';
import { buildReceivablesPath, RECEIVABLES_SECTIONS } from './financeiroReceivablesSections.js';
import { FOLLOWUP_AGENDA_MAX_DAYS, getFollowupDaysAgo, getFollowupKind } from './followupState.js';
import { computeFallbackTemperature } from './followupTemperature.js';

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

  const cooling = countCoolingFollowUps(leads);
  if (cooling > 0) {
    items.push({
      id: 'followups_cooling',
      label: cooling === 1 ? '1 retorno esfriando' : `${cooling} retornos esfriando`,
      href: '/?retornos=1',
      count: cooling,
    });
  } else {
    const followUps = countPendingFollowUps(leads);
    if (followUps > 0) {
      items.push({
        id: 'followups',
        label: followUps === 1 ? '1 retorno pendente' : `${followUps} retornos pendentes`,
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
