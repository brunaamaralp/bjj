import { contactEnrolledInYmdRange } from './studentEnrollmentDate.js';

const YM_RE = /^\d{4}-\d{2}$/;

/** Último dia do mês YYYY-MM. */
export function monthToYmdRange(ym) {
  const raw = String(ym || '').trim();
  if (!YM_RE.test(raw)) return { from: '', to: '' };
  const [y, m] = raw.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${raw}-01`,
    to: `${raw}-${String(lastDay).padStart(2, '0')}`,
  };
}

function resolveQuickPeriod(quickFilter, formatLocalYmd) {
  if (quickFilter === 'today') {
    const today = formatLocalYmd(new Date());
    return { from: today, to: today };
  }
  if (quickFilter === 'week') {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: formatLocalYmd(start), to: formatLocalYmd(end) };
  }
  if (quickFilter === 'month') {
    const now = new Date();
    return {
      from: formatLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: formatLocalYmd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  return { from: '', to: '' };
}

/** Período das colunas de lead (agendamento / cadastro). */
export function resolveLeadPeriodRange({ filterDateFrom, filterDateTo, quickFilter, formatLocalYmd }) {
  const quick = resolveQuickPeriod(quickFilter, formatLocalYmd);
  if (quick.from || quick.to) return quick;
  return { from: filterDateFrom || '', to: filterDateTo || '' };
}

/** Intervalo efetivo para coluna Matrícula (prioriza mês dedicado). */
export function resolveEnrollmentPeriodRange({
  enrollmentMonthFilter,
  filterDateFrom,
  filterDateTo,
  quickFilter,
  formatLocalYmd,
}) {
  if (enrollmentMonthFilter) {
    return monthToYmdRange(enrollmentMonthFilter);
  }

  const quick = resolveQuickPeriod(quickFilter, formatLocalYmd);
  if (quick.from || quick.to) return quick;

  return { from: filterDateFrom || '', to: filterDateTo || '' };
}

export function enrolledContactMatchesPeriod(contact, range) {
  return contactEnrolledInYmdRange(contact, range.from, range.to);
}
