import { buildMonthBuckets, buildWeekBuckets } from '../../lib/reportsMetrics.js';
import { account } from './appwrite.js';

function parseYmd(s) {
  const [Y, M, D] = String(s).split('-').map(Number);
  return new Date(Y, (M || 1) - 1, D || 1);
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthEnd(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Critério canônico para "alunos ativos" em Relatórios (KPI e gráfico de evolução):
 * headcount no último instante do intervalo selecionado (activeAtEnd), não no início.
 */
export function activeStudentsCount(sm) {
  if (!sm) return 0;
  if (sm.activeAtEnd != null) return Number(sm.activeAtEnd) || 0;
  return Math.max(
    0,
    (Number(sm.activeAtStart) || 0) + (Number(sm.newStudents) || 0) - (Number(sm.deactivations) || 0)
  );
}

/** Buckets do gráfico de evolução alinhados ao intervalo da toolbar (semanal ≤45d, mensal acima). */
export function buildStudentChartRanges(fromYmd, toYmd) {
  const fromDay = parseYmd(fromYmd);
  const toDay = parseYmd(toYmd);
  toDay.setHours(23, 59, 59, 999);
  const spanDays = Math.max(1, Math.ceil((toDay.getTime() - fromDay.getTime()) / 86400000) + 1);
  const fromIso = fromDay.toISOString();
  const toIso = toDay.toISOString();
  const buckets = (spanDays <= 45 ? buildWeekBuckets : buildMonthBuckets)(fromIso, toIso);

  if (!buckets.length) {
    return [{ from: fromYmd, to: toYmd, label: fromYmd === toYmd ? fromYmd : `${fromYmd} – ${toYmd}` }];
  }

  const fromMs = fromDay.getTime();
  const toMs = toDay.getTime();
  return buckets.map((b) => ({
    from: ymd(new Date(Math.max(b.start.getTime(), fromMs))),
    to: ymd(new Date(Math.min(b.end.getTime(), toMs))),
    label: b.label,
  }));
}

export async function fetchStudentMetricsForRange({ academyId, from, to }) {
  const fromDay = parseYmd(from);
  const toDay = parseYmd(to);
  const toEnd = new Date(toDay);
  toEnd.setHours(23, 59, 59, 999);
  const prevFrom = new Date(fromDay.getFullYear(), fromDay.getMonth() - 1, 1);
  const prevTo = monthEnd(prevFrom);

  const jwt = await account.createJWT();
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt.jwt}`,
      'x-academy-id': String(academyId || ''),
    },
    body: JSON.stringify({
      academyId,
      from: fromDay.toISOString(),
      to: toEnd.toISOString(),
      prevFrom: prevFrom.toISOString(),
      prevTo: prevTo.toISOString(),
      filters: { origin: 'all', type: 'all' },
      chartMode: 'monthly',
      slice: 'students',
      refresh: false,
    }),
  });
  if (!res.ok) throw new Error('student_metrics_failed');
  const data = await res.json();
  return data.studentMetrics || null;
}

export function studentMetricsToChartPoint(label, sm) {
  if (!sm) {
    return { label, ativos: 0, novos: 0, cancelamentos: 0 };
  }
  return {
    label,
    ativos: activeStudentsCount(sm),
    novos: Number(sm.newStudents) || 0,
    cancelamentos: Number(sm.deactivations) || 0,
  };
}
