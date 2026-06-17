import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_RISK_STATUS,
  ATTENDANCE_RETENTION_EVENT_TYPES,
  aggregateLastCheckinByStudent,
  buildStudentRetentionMetrics,
  classifyAttendanceRisk,
  daysSinceDate,
  isAtRiskTableStatus,
  isRetentionEligibleStudent,
  summarizeAttendanceRetention,
  retentionSnoozeUntilYmd,
  DEFAULT_ATTENDANCE_ABSENCE_SNOOZE_DAYS,
} from '../../../lib/attendanceRetentionCore.js';

const TODAY = new Date('2026-06-17T15:00:00');

describe('attendanceRetentionCore', () => {
  describe('classifyAttendanceRisk', () => {
    it('classifica ativo até 7 dias', () => {
      expect(
        classifyAttendanceRisk({ daysWithoutCheckin: 0, daysSinceEnrollment: 120 })
      ).toBe(ATTENDANCE_RISK_STATUS.ACTIVE);
      expect(
        classifyAttendanceRisk({ daysWithoutCheckin: 7, daysSinceEnrollment: 120 })
      ).toBe(ATTENDANCE_RISK_STATUS.ACTIVE);
    });

    it('classifica em risco entre 8 e 14 dias', () => {
      expect(
        classifyAttendanceRisk({ daysWithoutCheckin: 8, daysSinceEnrollment: 120 })
      ).toBe(ATTENDANCE_RISK_STATUS.AT_RISK);
      expect(
        classifyAttendanceRisk({ daysWithoutCheckin: 14, daysSinceEnrollment: 120 })
      ).toBe(ATTENDANCE_RISK_STATUS.AT_RISK);
    });

    it('classifica sumido a partir de 15 dias', () => {
      expect(
        classifyAttendanceRisk({ daysWithoutCheckin: 15, daysSinceEnrollment: 120 })
      ).toBe(ATTENDANCE_RISK_STATUS.ABSENT);
    });

    it('prioriza novato em risco (< 60 dias matrícula, 7+ sem treino)', () => {
      expect(
        classifyAttendanceRisk({ daysWithoutCheckin: 10, daysSinceEnrollment: 30 })
      ).toBe(ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK);
      expect(
        classifyAttendanceRisk({ daysWithoutCheckin: 20, daysSinceEnrollment: 30 })
      ).toBe(ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK);
    });

    it('não marca novato em risco após 60 dias de matrícula', () => {
      expect(
        classifyAttendanceRisk({ daysWithoutCheckin: 10, daysSinceEnrollment: 60 })
      ).toBe(ATTENDANCE_RISK_STATUS.AT_RISK);
    });
  });

  describe('daysSinceDate', () => {
    it('conta dias desde ISO', () => {
      expect(daysSinceDate('2026-06-10T18:00:00.000Z', TODAY)).toBe(7);
    });

    it('conta dias desde YYYY-MM-DD', () => {
      expect(daysSinceDate('2026-06-10', TODAY)).toBe(7);
    });
  });

  describe('buildStudentRetentionMetrics', () => {
    it('usa matrícula quando não há check-in', () => {
      const student = { enrollmentDate: '2026-01-01' };
      const metrics = buildStudentRetentionMetrics(student, null, TODAY);
      expect(metrics?.daysWithoutCheckin).toBeGreaterThanOrEqual(15);
      expect(metrics?.status).toBe(ATTENDANCE_RISK_STATUS.ABSENT);
    });

    it('usa último check-in quando existe', () => {
      const student = { enrollmentDate: '2026-01-01', converted_at: '2026-01-01' };
      const metrics = buildStudentRetentionMetrics(student, '2026-06-15T12:00:00.000Z', TODAY);
      expect(metrics?.daysWithoutCheckin).toBe(2);
      expect(metrics?.status).toBe(ATTENDANCE_RISK_STATUS.ACTIVE);
    });

    it('retorna null sem matrícula nem check-in', () => {
      expect(buildStudentRetentionMetrics({}, null, TODAY)).toBeNull();
    });
  });

  describe('isRetentionEligibleStudent', () => {
    it('exclui trancado', () => {
      const student = {
        studentStatus: 'active',
        contact_type: 'student',
        freeze_status: 'active',
      };
      expect(isRetentionEligibleStudent(student, TODAY)).toBe(false);
    });

    it('exclui snooze em contato', () => {
      const student = {
        studentStatus: 'active',
        contact_type: 'student',
        retention_snoozed_until: '2026-06-20',
      };
      expect(isRetentionEligibleStudent(student, TODAY)).toBe(false);
    });

    it('exclui flag retention_in_contact', () => {
      const student = {
        studentStatus: 'active',
        contact_type: 'student',
        retention_in_contact: true,
      };
      expect(isRetentionEligibleStudent(student, TODAY)).toBe(false);
    });

    it('inclui ativo sem trancamento', () => {
      const student = {
        studentStatus: 'active',
        contact_type: 'student',
      };
      expect(isRetentionEligibleStudent(student, TODAY)).toBe(true);
    });
  });

  describe('aggregateLastCheckinByStudent', () => {
    it('mantém o check-in mais recente por aluno', () => {
      const map = aggregateLastCheckinByStudent([
        { student_id: 's1', checked_in_at: '2026-06-01T10:00:00.000Z' },
        { student_id: 's1', checked_in_at: '2026-06-10T10:00:00.000Z' },
        { lead_id: 's2', checked_in_at: '2026-06-05T10:00:00.000Z' },
      ]);
      expect(map.get('s1')).toBe('2026-06-10T10:00:00.000Z');
      expect(map.get('s2')).toBe('2026-06-05T10:00:00.000Z');
    });
  });

  describe('summarizeAttendanceRetention', () => {
    it('ordena at_risk por dias sem check-in decrescente', () => {
      const students = [
        { id: 'a', name: 'Ana', enrollmentDate: '2026-01-01' },
        { id: 'b', name: 'Bob', enrollmentDate: '2026-01-01' },
      ];
      const last = new Map([
        ['a', '2026-06-01T10:00:00.000Z'],
        ['b', '2026-05-20T10:00:00.000Z'],
      ]);
      const { summary, atRisk } = summarizeAttendanceRetention(students, last, TODAY);
      expect(summary.absent).toBe(2);
      expect(atRisk[0].studentId).toBe('b');
      expect(atRisk[1].studentId).toBe('a');
    });
  });

  describe('isAtRiskTableStatus', () => {
    it('inclui em risco, sumido e novato', () => {
      expect(isAtRiskTableStatus(ATTENDANCE_RISK_STATUS.AT_RISK)).toBe(true);
      expect(isAtRiskTableStatus(ATTENDANCE_RISK_STATUS.ABSENT)).toBe(true);
      expect(isAtRiskTableStatus(ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK)).toBe(true);
      expect(isAtRiskTableStatus(ATTENDANCE_RISK_STATUS.ACTIVE)).toBe(false);
    });
  });

  describe('retentionSnoozeUntilYmd', () => {
    it('usa 14 dias por padrão', () => {
      expect(retentionSnoozeUntilYmd(undefined, TODAY)).toBe('2026-07-01');
    });

    it('respeita duração informada', () => {
      expect(retentionSnoozeUntilYmd(7, TODAY)).toBe('2026-06-24');
      expect(retentionSnoozeUntilYmd(30, TODAY)).toBe('2026-07-17');
    });
  });

  describe('ATTENDANCE_RETENTION_EVENT_TYPES', () => {
    it('inclui snooze rápido sem motivo', () => {
      expect(ATTENDANCE_RETENTION_EVENT_TYPES.SNOOZE).toBe('attendance_snooze');
    });
  });
});
