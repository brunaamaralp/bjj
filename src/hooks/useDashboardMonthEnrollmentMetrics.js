import { useMemo } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import {
  countEnrollmentsInMonth,
  countLeadsCreatedInMonth,
  currentMonthRange,
  previousMonthRange,
} from '../lib/dashboardManagerMetrics.js';

/**
 * KPI de matrículas do mês — subscribe isolado em `leads[]` para métricas mensais.
 * @param {Array} students
 */
export function useDashboardMonthEnrollmentMetrics(students) {
  const leads = useLeadStore((s) => s.leads);

  return useMemo(() => {
    const monthRange = currentMonthRange();
    const prevRange = previousMonthRange();
    const enrolledInMonth = countEnrollmentsInMonth(leads, students, monthRange);
    const leadsInMonth = countLeadsCreatedInMonth(leads, monthRange);
    const enrolledPrevMonth = countEnrollmentsInMonth(leads, students, prevRange);
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
  }, [leads, students]);
}
