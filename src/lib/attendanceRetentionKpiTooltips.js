import {
  DEFAULT_WEEKLY_CHECKINS_EXPECTED,
  DEFAULT_WEEKLY_RETENTION_RULES,
  WEEKLY_RETENTION_WINDOW_DAYS,
} from '../../lib/attendanceWeeklyGoalCore.js';

/**
 * Textos de tooltip dos KPIs de retenção por frequência (Catraca / Relatórios).
 * @param {{
 *   defaultWeeklyExpected?: number;
 *   windowDays?: number;
 *   rules?: typeof DEFAULT_WEEKLY_RETENTION_RULES;
 * }} [options]
 */
export function attendanceRetentionKpiTooltips(options = {}) {
  const expected = options.defaultWeeklyExpected ?? DEFAULT_WEEKLY_CHECKINS_EXPECTED;
  const windowDays = options.windowDays ?? WEEKLY_RETENTION_WINDOW_DAYS;
  const rules = options.rules ?? DEFAULT_WEEKLY_RETENTION_RULES;

  return {
    at_risk: `Abaixo da meta semanal (${expected} check-ins em ${windowDays} dias por padrão) ou ${rules.atRiskMinDaysWithoutCheckin}–${rules.absentMinDaysWithoutCheckin - 1} dias sem treinar. Meta vem do plano ou da turma do aluno.`,
    absent: `Zero check-ins na janela de ${windowDays} dias e ${rules.absentMinDaysWithoutCheckin}+ dias sem treinar. Exclui trancados, inativos, «em contato» e snooze.`,
    active: `Atingiu a meta semanal do plano/turma nos últimos ${windowDays} dias, ou ainda está no período de carência (${rules.graceDaysWithoutCheckin} dias).`,
  };
}
