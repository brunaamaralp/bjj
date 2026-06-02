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

function activeAtEndFromMetrics(sm) {
  if (!sm) return 0;
  if (sm.activeAtEnd != null) return Number(sm.activeAtEnd) || 0;
  return Math.max(
    0,
    (Number(sm.activeAtStart) || 0) + (Number(sm.newStudents) || 0) - (Number(sm.deactivations) || 0)
  );
}

/** Últimos 6 meses civis terminando no mês de `anchorYmd`. */
export function buildLastSixMonthRanges(anchorYmd) {
  const anchor = parseYmd(anchorYmd);
  const endMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const ranges = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(endMonth.getFullYear(), endMonth.getMonth() - i, 1);
    const from = ymd(m);
    const to = ymd(monthEnd(m));
    const label = m.toLocaleDateString('pt-BR', { month: 'short' }).replace(/\./g, '');
    ranges.push({ from, to, label });
  }
  return ranges;
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
    ativos: activeAtEndFromMetrics(sm),
    novos: Number(sm.newStudents) || 0,
    cancelamentos: Number(sm.deactivations) || 0,
  };
}
