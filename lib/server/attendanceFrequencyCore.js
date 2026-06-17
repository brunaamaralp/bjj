/**
 * Agregações analíticas de frequência (Relatórios → Frequência).
 */
import { toYmd, addDays } from '../planFreezeCore.js';

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function parseCheckinYmd(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  return s.slice(0, 10);
}

function startOfWeekMonday(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Heatmap: últimas N semanas (seg–dom), contagem de check-ins por dia.
 * @param {Array<{ checked_in_at?: string }>} docs
 * @param {number} weeks
 * @param {Date} [today]
 */
export function buildAttendanceWeekHeatmap(docs, weeks = 12, today = new Date()) {
  const w = Math.min(24, Math.max(4, Number(weeks) || 12));
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  const start = addDays(startOfWeekMonday(end), -(w - 1) * 7);
  const startYmd = toYmd(start);

  const buckets = [];
  for (let i = 0; i < w; i++) {
    const weekStart = addDays(start, i * 7);
    const weekEnd = addDays(weekStart, 6);
    buckets.push({
      weekStart: toYmd(weekStart),
      weekEnd: toYmd(weekEnd),
      weekLabel: `${String(weekStart.getDate()).padStart(2, '0')}/${String(weekStart.getMonth() + 1).padStart(2, '0')}`,
      days: [0, 0, 0, 0, 0, 0, 0],
      total: 0,
    });
  }

  const weekIndexByStart = new Map(buckets.map((b, i) => [b.weekStart, i]));

  for (const row of docs || []) {
    const ymd = parseCheckinYmd(row.checked_in_at);
    if (!ymd || ymd < startYmd) continue;
    const d = new Date(`${ymd}T12:00:00`);
    const ws = toYmd(startOfWeekMonday(d));
    const idx = weekIndexByStart.get(ws);
    if (idx == null) continue;
    const dow = d.getDay();
    buckets[idx].days[dow] += 1;
    buckets[idx].total += 1;
  }

  return { weeks: buckets, dowLabels: DOW_LABELS };
}

/**
 * Ranking de alunos por check-ins no período.
 * @param {Array<{ checked_in_at?: string; student_id?: string; lead_id?: string }>} docs
 * @param {Map<string, { name?: string; turma?: string; belt?: string }>} studentById
 * @param {number} limit
 */
export function buildAttendanceStudentRanking(docs, studentById, limit = 15) {
  const counts = new Map();
  for (const row of docs || []) {
    const sid = String(row.student_id || row.lead_id || '').trim();
    if (!sid) continue;
    counts.set(sid, (counts.get(sid) || 0) + 1);
  }

  const rows = [...counts.entries()]
    .map(([studentId, checkins]) => {
      const s = studentById.get(studentId) || {};
      return {
        studentId,
        name: String(s.name || 'Aluno').trim() || 'Aluno',
        turma: String(s.turma || s.className || '').trim(),
        belt: String(s.belt || '').trim(),
        checkins,
      };
    })
    .sort((a, b) => b.checkins - a.checkins || a.name.localeCompare(b.name, 'pt-BR'));

  return rows.slice(0, Math.max(5, Number(limit) || 15));
}

/**
 * @param {Array<{ checked_in_at?: string }>} docs
 * @param {Date} [today]
 */
export function buildAttendanceMonthComparison(docs, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const thisPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const prev = new Date(y, m - 1, 1);
  const lastPrefix = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  let thisMonth = 0;
  let lastMonth = 0;
  for (const row of docs || []) {
    const ymd = parseCheckinYmd(row.checked_in_at);
    if (!ymd) continue;
    if (ymd.startsWith(thisPrefix)) thisMonth += 1;
    else if (ymd.startsWith(lastPrefix)) lastMonth += 1;
  }

  let deltaPct = null;
  if (lastMonth > 0) {
    deltaPct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
  } else if (thisMonth > 0) {
    deltaPct = 100;
  }

  return { thisMonth, lastMonth, deltaPct };
}

/**
 * Conta check-ins dentro de intervalo ISO (inclusivo por YMD).
 */
export function countCheckinsInRange(docs, fromYmd, toYmd) {
  const from = String(fromYmd || '').slice(0, 10);
  const to = String(toYmd || '').slice(0, 10);
  if (!from || !to) return 0;
  let n = 0;
  for (const row of docs || []) {
    const ymd = parseCheckinYmd(row.checked_in_at);
    if (ymd && ymd >= from && ymd <= to) n += 1;
  }
  return n;
}
