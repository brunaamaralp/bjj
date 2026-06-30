import { useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import {
  countEnrollmentsInMonth,
  countLeadsCreatedInMonth,
  currentMonthRange,
  previousMonthRange,
} from '../lib/dashboardManagerMetrics.js';
import { fetchStudentMetricsForRange } from '../lib/reportsStudentMetricsApi.js';
import { formatLocalYmd } from '../lib/studentEnrollmentDate.js';

function monthYmdBounds(range) {
  return {
    from: formatLocalYmd(range.from),
    to: formatLocalYmd(range.to),
  };
}

/**
 * KPI de matrículas do mês — contagem canônica via API (todos os alunos);
 * fallback local enquanto carrega ou se a API falhar.
 * @param {Array} students
 */
export function useDashboardMonthEnrollmentMetrics(students) {
  const academyId = useLeadStore((s) => s.academyId);
  const leads = useLeadStore((s) => s.leads);
  const [serverMetrics, setServerMetrics] = useState(null);

  const monthRange = useMemo(() => currentMonthRange(), []);
  const prevRange = useMemo(() => previousMonthRange(), []);

  useEffect(() => {
    if (!academyId) return undefined;

    let cancelled = false;
    const { from, to } = monthYmdBounds(monthRange);

    fetchStudentMetricsForRange({ academyId, from, to })
      .then((sm) => {
        if (!cancelled) setServerMetrics(sm);
      })
      .catch(() => {
        if (!cancelled) setServerMetrics(null);
      });

    return () => {
      cancelled = true;
    };
  }, [academyId, monthRange.ym]);

  const clientMetrics = useMemo(() => {
    const enrolledInMonth = countEnrollmentsInMonth(leads, students, monthRange);
    const leadsInMonth = countLeadsCreatedInMonth(leads, monthRange);
    const enrolledPrevMonth = countEnrollmentsInMonth(leads, students, prevRange);
    return { enrolledInMonth, leadsInMonth, enrolledPrevMonth };
  }, [leads, students, monthRange, prevRange]);

  return useMemo(() => {
    const enrolledInMonth =
      academyId && serverMetrics?.newStudents != null
        ? Number(serverMetrics.newStudents) || 0
        : clientMetrics.enrolledInMonth;
    const enrolledPrevMonth =
      academyId && serverMetrics?.previous?.newStudents != null
        ? Number(serverMetrics.previous.newStudents) || 0
        : clientMetrics.enrolledPrevMonth;
    const { leadsInMonth } = clientMetrics;
    const delta = enrolledInMonth - enrolledPrevMonth;

    let sub = '';
    let subTone = '';
    if (leadsInMonth > 0) {
      sub = `de ${leadsInMonth} leads`;
      subTone = 'neutral';
    } else if (delta > 0) {
      sub = `+${delta} vs mês passado`;
      subTone = 'positive';
    } else if (delta < 0) {
      sub = `${delta} vs mês passado`;
      subTone = 'neutral';
    }

    return { enrolledInMonth, sub, subTone };
  }, [academyId, serverMetrics, clientMetrics]);
}
