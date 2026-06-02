import { LEAD_STATUS } from '../store/useLeadStore';
import { isActiveStudent } from './studentStatus.js';
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

const excludeImported = (l) => String(l?.origin || '').trim() !== 'Planilha';

/** Leads criados no mês corrente (exclui importação planilha). */
export function countLeadsCreatedInMonth(leads, range = currentMonthRange()) {
  return (leads || []).filter(
    (l) => excludeImported(l) && isTimestampInRange(l.createdAt, range.from, range.to)
  ).length;
}

/** Matrículas no mês: convertedAt, lead convertido ou aluno com data de ingresso no período. */
export function countEnrollmentsInMonth(leads, students, range = currentMonthRange()) {
  const ids = new Set();
  for (const l of leads || []) {
    if (!excludeImported(l)) continue;
    const convertedAt = String(l.convertedAt || '').trim();
    if (convertedAt && isTimestampInRange(convertedAt, range.from, range.to)) {
      ids.add(String(l.id || '').trim());
      continue;
    }
    if (l.status === LEAD_STATUS.CONVERTED && isTimestampInRange(l.createdAt, range.from, range.to)) {
      ids.add(String(l.id || '').trim());
    }
  }
  for (const s of students || []) {
    if (!isActiveStudent(s) && !String(s.enrollmentDate || '').trim()) continue;
    const enr = String(s.enrollmentDate || '').trim();
    if (enr && isTimestampInRange(enr.length === 10 ? `${enr}T12:00:00` : enr, range.from, range.to)) {
      ids.add(String(s.id || '').trim());
    }
  }
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
