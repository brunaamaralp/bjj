import { describe, it, expect } from 'vitest';
import {
  countLessonsForStaff,
  buildClosingAmounts,
  financeExpenseAmountFromNet,
  buildProfessorClosingExpenseDescription,
  CLOSING_STATUS_OPEN,
  CLOSING_STATUS_PAID,
} from '../../lib/professorClosing.js';

describe('professorClosing', () => {
  it('dedupes same person as professor and instructor on one slot', () => {
    const slots = [
      {
        lesson_status: 'confirmed',
        slot_date: '2026-10-01',
        professor_user_id: 'roster:p1',
        instructor_user_id: 'roster:p1',
      },
    ];
    expect(countLessonsForStaff(slots, 'roster:p1')).toBe(1);
  });

  it('buildClosingAmounts applies rates', () => {
    const amounts = buildClosingAmounts({
      lessonCount: 2,
      experimentalCount: 1,
      productDebits: [70, 30],
      rates: { lesson_amount: 50, experimental_amount: 20 },
    });
    expect(amounts).toEqual({
      credits_lessons: 100,
      credits_experimental: 20,
      debits_products: 100,
      net: 20,
    });
  });

  it('financeExpenseAmountFromNet clamps negative to 0', () => {
    expect(financeExpenseAmountFromNet(-40)).toBe(0);
    expect(financeExpenseAmountFromNet(120)).toBe(120);
  });

  it('buildProfessorClosingExpenseDescription formats name and month', () => {
    expect(buildProfessorClosingExpenseDescription('Ana', '2026-10')).toBe(
      'Fechamento professor — Ana — 2026-10'
    );
    expect(CLOSING_STATUS_OPEN).toBe('aberto');
    expect(CLOSING_STATUS_PAID).toBe('pago');
  });
});
