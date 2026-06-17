import { isActiveStudent } from './studentStatus.js';
import {
  formatLocalYmd,
  isImportedSpreadsheetContact,
  matriculationYmdInRange,
  shouldCountEnrollmentContact,
} from './studentEnrollmentDate.js';
/** Limites do mês civil corrente (início → fim do dia de hoje se mês atual). */
export function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = new Date(y, m, 1, 0, 0, 0, 0);
  const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from, to, ym };
}

/** Limites do mês civil anterior. */
export function previousMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const from = new Date(prevY, prevM, 1, 0, 0, 0, 0);
  const to = new Date(prevY, prevM + 1, 0, 23, 59, 59, 999);
  const ym = `${prevY}-${String(prevM + 1).padStart(2, '0')}`;
  return { from, to, ym };
}

function parseLeadTime(iso) {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
}

export function isTimestampInRange(iso, from, to) {
  const t = parseLeadTime(iso);
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

const excludeImported = (l) => !isImportedSpreadsheetContact(l);

function matriculatedInRange(contact, range) {
  return matriculationYmdInRange(
    contact,
    formatLocalYmd(range.from),
    formatLocalYmd(range.to)
  );
}

/** Leads criados no mês corrente (exclui importação planilha). */
export function countLeadsCreatedInMonth(leads, range = currentMonthRange()) {
  return (leads || []).filter(
    (l) => excludeImported(l) && isTimestampInRange(l.createdAt, range.from, range.to)
  ).length;
}

/** Matrículas no mês: ingresso no período (deduplicado por id). */
export function countEnrollmentsInMonth(leads, students, range = currentMonthRange()) {
  const ids = new Set();

  const tryAdd = (contact) => {
    if (!shouldCountEnrollmentContact(contact)) return;
    const id = String(contact?.id || contact?.$id || '').trim();
    if (!id || ids.has(id)) return;
    if (!matriculatedInRange(contact, range)) return;
    ids.add(id);
  };

  for (const s of students || []) tryAdd({ ...s, _isStudent: true });
  for (const l of leads || []) tryAdd(l);

  return ids.size;
}

export function conversionRatePercent(leadsInMonth, enrolledInMonth) {
  if (!leadsInMonth) return 0;
  return Math.round((enrolledInMonth / leadsInMonth) * 100);
}

export function countActiveStudents(students) {
  return (students || []).filter((s) => isActiveStudent(s)).length;
}

export function countNeedHumanLeads(leads) {
  return (leads || []).filter((l) => excludeImported(l) && Boolean(l.needHuman)).length;
}

/** Mesmas regras de urgência crítica que `useSlaAlerts` (dias na etapa ≥ 2× SLA). */
export function countSlaCriticalFromStages(leads, stages) {
  const slaMap = {};
  const BLOCKED = new Set(['matriculado', 'perdido', 'perdidos', 'não compareceu', 'nao compareceu']);
  const norm = (v) =>
    String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  (stages || []).forEach((s) => {
    const sid = String(s?.id || '').trim();
    const label = String(s?.label || '').trim();
    const slaDays = Number(s?.slaDays);
    if (BLOCKED.has(norm(sid)) || BLOCKED.has(norm(label))) return;
    if (Number.isFinite(slaDays) && slaDays > 0) slaMap[sid] = slaDays;
  });

  let count = 0;
  for (const lead of leads || []) {
    if (!excludeImported(lead)) continue;
    const stageId = String(lead?.pipelineStage || '').trim();
    const slaDays = slaMap[stageId];
    if (!slaDays) continue;
    const ref = lead?.pipelineStageChangedAt || lead?.createdAt;
    const refMs = new Date(ref).getTime();
    if (!Number.isFinite(refMs)) continue;
    const daysInStage = Math.floor((Date.now() - refMs) / 86400000);
    if (daysInStage >= slaDays * 2) count += 1;
  }
  return count;
}

export function countOverdueStudents(students) {
  return (students || []).filter((s) => isActiveStudent(s) && Boolean(s.overdue)).length;
}

export function countOverdueTasks(tasks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  return (tasks || []).filter((t) => {
    if (String(t?.status || '').trim().toLowerCase() === 'done') return false;
    const raw = String(t?.due_date || t?.dueDate || '').trim().slice(0, 10);
    if (!raw) return false;
    const due = new Date(`${raw}T00:00:00`).getTime();
    return Number.isFinite(due) && due < todayMs;
  }).length;
}

/** Tarefas pendentes com vencimento no dia (hero KPI «Tarefas»). */
export function filterPendingTasksForDate(tasks, date = new Date()) {
  const dayYmd = formatLocalYmd(date);
  return (tasks || [])
    .filter((t) => {
      if (String(t?.status || '').trim().toLowerCase() === 'done') return false;
      const due = String(t?.due_date || t?.dueDate || '').trim().slice(0, 10);
      return due === dayYmd;
    })
    .sort((a, b) => {
      const ta = String(a?.due_date || a?.dueDate || '').trim();
      const tb = String(b?.due_date || b?.dueDate || '').trim();
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.localeCompare(tb);
    });
}

export function countPendingTasksToday(tasks, date = new Date()) {
  return filterPendingTasksForDate(tasks, date).length;
}
