import { describe, it, expect } from 'vitest';
import {
  buildAttendanceMonthComparison,
  buildAttendanceStudentRanking,
  buildAttendanceWeekHeatmap,
  countCheckinsInRange,
} from '../../../lib/server/attendanceFrequencyCore.js';

describe('attendanceFrequencyCore', () => {
  const docs = [
    { checked_in_at: '2026-06-10T10:00:00.000Z', student_id: 's1' },
    { checked_in_at: '2026-06-10T18:00:00.000Z', student_id: 's2' },
    { checked_in_at: '2026-06-12T10:00:00.000Z', student_id: 's1' },
    { checked_in_at: '2026-05-20T10:00:00.000Z', student_id: 's1' },
  ];

  it('buildAttendanceWeekHeatmap conta check-ins por dia da semana', () => {
    const today = new Date('2026-06-15T12:00:00.000Z');
    const { weeks, dowLabels } = buildAttendanceWeekHeatmap(docs, 4, today);
    expect(dowLabels).toHaveLength(7);
    expect(weeks.length).toBe(4);
    const total = weeks.reduce((acc, w) => acc + w.total, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('buildAttendanceStudentRanking ordena por volume', () => {
    const map = new Map([
      ['s1', { name: 'Ana' }],
      ['s2', { name: 'Bruno' }],
    ]);
    const rows = buildAttendanceStudentRanking(docs, map, 5);
    expect(rows[0].studentId).toBe('s1');
    expect(rows[0].checkins).toBe(3);
  });

  it('buildAttendanceMonthComparison compara meses', () => {
    const today = new Date('2026-06-15T12:00:00.000Z');
    const cmp = buildAttendanceMonthComparison(docs, today);
    expect(cmp.thisMonth).toBe(3);
    expect(cmp.lastMonth).toBe(1);
    expect(cmp.deltaPct).toBe(200);
  });

  it('countCheckinsInRange filtra por YMD', () => {
    expect(countCheckinsInRange(docs, '2026-06-01', '2026-06-30')).toBe(3);
    expect(countCheckinsInRange(docs, '2026-05-01', '2026-05-31')).toBe(1);
  });
});
