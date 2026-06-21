import { useMemo } from 'react';
import { enrollmentDateYmd, formatLocalYmd } from '../lib/studentEnrollmentDate.js';
import { STUDENT_STATUS } from '../lib/studentStatus.js';

/**
 * Retorna alunos que completam 1 ano de matrícula nos próximos 7 dias.
 * Calculado localmente dos students já no store — sem fetch adicional.
 *
 * Nota: aniversários de nascimento (todayBirthdays) já são computados no
 * Dashboard.jsx e são passados diretamente ao bloco de relacionamento.
 *
 * @param {object[]} students — lista do useStudentStore
 * @returns {{ oneYearAnniversaries: object[] }}
 */
export function useConsolidacaoRelacionamento(students) {
  return useMemo(() => {
    const today = new Date();

    // Janela de 7 dias a contar de hoje: alunos que matricularam
    // EXATAMENTE 1 ano atrás (±7 dias), por ano civil.
    const windowStart = new Date(today);
    windowStart.setFullYear(today.getFullYear() - 1);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowStart.getDate() + 7);
    const windowStartYmd = formatLocalYmd(windowStart);
    const windowEndYmd   = formatLocalYmd(windowEnd);

    const oneYearAnniversaries = [];

    for (const s of students || []) {
      if (String(s?.studentStatus || '').trim() === STUDENT_STATUS.INACTIVE) continue;

      const enroll = enrollmentDateYmd(s); // "YYYY-MM-DD" ou ''
      if (enroll && enroll >= windowStartYmd && enroll <= windowEndYmd) {
        oneYearAnniversaries.push(s);
      }
    }

    return { oneYearAnniversaries };
  }, [students]);
}
