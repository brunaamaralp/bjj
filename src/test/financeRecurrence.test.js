import { describe, it, expect } from 'vitest';
import {
  normalizeRecurrenceType,
  normalizeRecurrenceDay,
  parseRecurrenceEnd,
} from '../../lib/server/financeTxFields.js';

function currentYm(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isRecurrenceEndPast(recurrenceEnd, now = new Date()) {
  const end = String(recurrenceEnd || '').trim();
  if (!/^\d{4}-\d{2}$/.test(end)) return false;
  return end < currentYm(now);
}

function shouldRunToday(template, now = new Date()) {
  const type = normalizeRecurrenceType(template.recurrence_type);
  const day = Number(template.recurrence_day) || 1;
  if (type === 'monthly') {
    const dom = Math.min(28, Math.max(1, day));
    return now.getUTCDate() === dom;
  }
  if (type === 'weekly') {
    const dow = Math.min(6, Math.max(0, Math.trunc(day)));
    return now.getUTCDay() === dow;
  }
  return false;
}

describe('finance recurrence fields', () => {
  it('normalizes monthly day to 1-28', () => {
    expect(normalizeRecurrenceDay('monthly', 99)).toBe(28);
    expect(normalizeRecurrenceDay('monthly', 0)).toBe(1);
  });

  it('normalizes weekly day to 0-6', () => {
    expect(normalizeRecurrenceDay('weekly', 9)).toBe(6);
    expect(normalizeRecurrenceDay('weekly', -1)).toBe(0);
  });

  it('parses recurrence_end YYYY-MM only', () => {
    expect(parseRecurrenceEnd('2026-05')).toBe('2026-05');
    expect(parseRecurrenceEnd('05/2026')).toBe('');
  });
});

describe('finance recurrence schedule', () => {
  it('runs monthly on configured UTC day', () => {
    const now = new Date('2026-05-15T12:00:00.000Z');
    expect(shouldRunToday({ recurrence_type: 'monthly', recurrence_day: 15 }, now)).toBe(true);
    expect(shouldRunToday({ recurrence_type: 'monthly', recurrence_day: 16 }, now)).toBe(false);
  });

  it('runs weekly on configured weekday', () => {
    const wed = new Date('2026-05-20T12:00:00.000Z');
    expect(shouldRunToday({ recurrence_type: 'weekly', recurrence_day: 3 }, wed)).toBe(true);
  });

  it('detects past recurrence_end', () => {
    const now = new Date('2026-05-20T12:00:00.000Z');
    expect(isRecurrenceEndPast('2026-04', now)).toBe(true);
    expect(isRecurrenceEndPast('2026-06', now)).toBe(false);
    expect(isRecurrenceEndPast('', now)).toBe(false);
  });
});
