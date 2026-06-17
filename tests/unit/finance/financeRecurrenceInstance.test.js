import { describe, expect, it } from 'vitest';
import {
  shouldCreateInitialPayableInstance,
  shouldRunRecurrenceToday,
} from '../../../lib/server/financeRecurrenceInstance.js';

describe('financeRecurrenceInstance', () => {
  it('shouldRunRecurrenceToday uses calendar day for monthly templates', () => {
    const template = { recurrence_type: 'monthly', recurrence_day: 10 };
    expect(shouldRunRecurrenceToday(template, new Date('2026-06-10T15:00:00-03:00'))).toBe(true);
    expect(shouldRunRecurrenceToday(template, new Date('2026-06-11T15:00:00-03:00'))).toBe(false);
  });

  it('shouldCreateInitialPayableInstance when due within 30 days', () => {
    const template = {
      is_recurrence_template: true,
      recurrence_type: 'monthly',
      due_date: '2026-06-20',
    };
    expect(shouldCreateInitialPayableInstance(template, '2026-06-16')).toBe(true);
    expect(shouldCreateInitialPayableInstance(template, '2026-05-01')).toBe(false);
  });
});
