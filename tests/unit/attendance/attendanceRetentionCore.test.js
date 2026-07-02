import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_RISK_STATUS,
  aggregateCheckinsInWindowByStudent,
  buildStudentRetentionMetrics,
  buildWeeklyGoalsContext,
  classifyWeeklyAttendanceRisk,
  isAtRiskTableStatus,
  resolveWeeklyCheckinsExpected,
  summarizeAttendanceRetention,
} from '../../../lib/attendanceRetentionCore.js';

const TODAY = new Date('2026-06-17T15:00:00');

describe('attendanceWeeklyGoalCore via attendanceRetentionCore', () => {
  const goalsContext = buildWeeklyGoalsContext(
    {
      plans: [
        { name: '2x Semana', price: 200, weeklyCheckinsExpected: 2 },
        { name: 'Ilimitado', price: 300, weeklyCheckinsExpected: 4 },
      ],
    },
    [{ name: 'Kids', weeklyCheckinsExpected: 3, is_active: true }]
  );

  describe('resolveWeeklyCheckinsExpected', () => {
    it('prioriza plano, depois turma, depois padrão', () => {
      expect(
        resolveWeeklyCheckinsExpected({ plan: '2x Semana' }, goalsContext)
      ).toBe(2);
      expect(
        resolveWeeklyCheckinsExpected({ plan: 'Outro', turma: 'Kids' }, goalsContext)
      ).toBe(3);
      expect(resolveWeeklyCheckinsExpected({ turma: 'Adultos' }, goalsContext)).toBe(2);
    });
  });

  describe('classifyWeeklyAttendanceRisk', () => {
    it('marca ativo quando atinge meta semanal', () => {
      expect(
        classifyWeeklyAttendanceRisk({
          checkinsLast7Days: 2,
          daysWithoutCheckin: 1,
          weeklyExpected: 2,
        })
      ).toBe(ATTENDANCE_RISK_STATUS.ACTIVE);
    });

    it('marca em risco quando abaixo da meta mas com algum check-in', () => {
      expect(
        classifyWeeklyAttendanceRisk({
          checkinsLast7Days: 1,
          daysWithoutCheckin: 2,
          weeklyExpected: 2,
        })
      ).toBe(ATTENDANCE_RISK_STATUS.AT_RISK);
    });

    it('marca sumido após 15 dias sem treino e zero na semana', () => {
      expect(
        classifyWeeklyAttendanceRisk({
          checkinsLast7Days: 0,
          daysWithoutCheckin: 15,
          weeklyExpected: 2,
        })
      ).toBe(ATTENDANCE_RISK_STATUS.ABSENT);
    });

    it('dá carência de 7 dias para matrícula recente sem check-in', () => {
      expect(
        classifyWeeklyAttendanceRisk({
          checkinsLast7Days: 0,
          daysWithoutCheckin: 5,
          weeklyExpected: 2,
        })
      ).toBe(ATTENDANCE_RISK_STATUS.ACTIVE);
    });
  });

  describe('buildStudentRetentionMetrics', () => {
    it('usa contagem semanal e meta do plano', () => {
      const student = { plan: '2x Semana', enrollmentDate: '2026-01-01' };
      const metrics = buildStudentRetentionMetrics(student, '2026-06-15T12:00:00.000Z', TODAY, {
        checkinsLast7Days: 1,
        goalsContext,
      });
      expect(metrics?.weeklyCheckinsExpected).toBe(2);
      expect(metrics?.checkinsLast7Days).toBe(1);
      expect(metrics?.status).toBe(ATTENDANCE_RISK_STATUS.AT_RISK);
    });
  });

  describe('aggregateCheckinsInWindowByStudent', () => {
    it('conta check-ins na janela rolante de 7 dias', () => {
      const map = aggregateCheckinsInWindowByStudent(
        [
          { student_id: 's1', checked_in_at: '2026-06-16T10:00:00.000Z' },
          { student_id: 's1', checked_in_at: '2026-06-10T10:00:00.000Z' },
        ],
        7,
        TODAY
      );
      expect(map.get('s1')).toBe(1);
    });
  });

  describe('summarizeAttendanceRetention', () => {
    it('ordena fila por gap semanal e status', () => {
      const students = [
        { id: 'a', name: 'Ana', plan: '2x Semana', enrollmentDate: '2026-01-01' },
        { id: 'b', name: 'Bob', plan: '2x Semana', enrollmentDate: '2026-01-01' },
      ];
      const last = new Map([
        ['a', '2026-06-01T10:00:00.000Z'],
        ['b', '2026-05-20T10:00:00.000Z'],
      ]);
      const count7 = new Map([
        ['a', 0],
        ['b', 0],
      ]);
      const { summary, atRisk } = summarizeAttendanceRetention(students, last, TODAY, {
        checkinsLast7DaysByStudent: count7,
        goalsContext,
      });
      expect(summary.absent).toBe(2);
      expect(atRisk[0].studentId).toBe('b');
    });
  });

  describe('isAtRiskTableStatus', () => {
    it('inclui apenas em risco e sumido', () => {
      expect(isAtRiskTableStatus(ATTENDANCE_RISK_STATUS.AT_RISK)).toBe(true);
      expect(isAtRiskTableStatus(ATTENDANCE_RISK_STATUS.ABSENT)).toBe(true);
      expect(isAtRiskTableStatus('newcomer_at_risk')).toBe(true);
      expect(isAtRiskTableStatus(ATTENDANCE_RISK_STATUS.ACTIVE)).toBe(false);
    });
  });
});
