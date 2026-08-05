import { describe, it, expect } from 'vitest';
import { buildAttendanceRetentionReasonPhrase } from '../lib/attendanceRetentionReasonPhrase.js';

describe('buildAttendanceRetentionReasonPhrase', () => {
  it('sumido com dias', () => {
    expect(
      buildAttendanceRetentionReasonPhrase({
        status: 'absent',
        daysWithoutCheckin: 18,
        checkinsLast7Days: 0,
        weeklyCheckinsExpected: 3,
      })
    ).toBe('Sumido · 18 dias sem treinar');
  });

  it('em risco abaixo da meta', () => {
    expect(
      buildAttendanceRetentionReasonPhrase({
        status: 'at_risk',
        daysWithoutCheckin: 9,
        checkinsLast7Days: 1,
        weeklyCheckinsExpected: 3,
      })
    ).toBe('Abaixo da meta (1/3) · 9 dias sem treinar');
  });

  it('normaliza newcomer legado para em risco', () => {
    const phrase = buildAttendanceRetentionReasonPhrase({
      status: 'newcomer_at_risk',
      daysWithoutCheckin: 7,
      checkinsLast7Days: 0,
      weeklyCheckinsExpected: 2,
    });
    expect(phrase.startsWith('Abaixo da meta')).toBe(true);
    expect(phrase).toContain('7 dias sem treinar');
  });

  it('dias inválidos usa fallback', () => {
    expect(
      buildAttendanceRetentionReasonPhrase({
        status: 'absent',
        daysWithoutCheckin: null,
      })
    ).toBe('Sumido · sem check-in recente');
  });
});
