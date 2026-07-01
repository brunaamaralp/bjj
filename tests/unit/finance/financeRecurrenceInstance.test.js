import { describe, expect, it, vi } from 'vitest';
import {
  shouldCreateInitialPayableInstance,
  shouldRunRecurrenceToday,
  resolvePayableInstanceForSettle,
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

  it('resolvePayableInstanceForSettle reutiliza instância pending existente', async () => {
    const pendingDoc = {
      $id: 'inst-1',
      status: 'pending',
      academyId: 'acad-1',
      recurrence_origin_id: 'tpl-1',
      competence_month: '2026-07',
    };
    const databases = {
      listDocuments: vi.fn().mockResolvedValue({ documents: [pendingDoc] }),
      getDocument: vi.fn(),
    };
    const template = {
      $id: 'tpl-1',
      is_recurrence_template: true,
      academyId: 'acad-1',
      recurrence_type: 'monthly',
      recurrence_day: 10,
      gross: 450,
      type: 'expense_operational',
      direction: 'out',
    };
    const result = await resolvePayableInstanceForSettle(
      databases,
      'db',
      'col',
      template,
      '2026-07-10'
    );
    expect(result).toBe(pendingDoc);
    expect(databases.getDocument).not.toHaveBeenCalled();
  });

  it('resolvePayableInstanceForSettle rejeita data inválida', async () => {
    const template = { $id: 'tpl-1', is_recurrence_template: true, academyId: 'acad-1' };
    await expect(
      resolvePayableInstanceForSettle({}, 'db', 'col', template, 'invalid')
    ).rejects.toThrow('invalid_due_date');
  });
});
