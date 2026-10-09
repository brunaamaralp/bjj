import { describe, it, expect } from 'vitest';
import {
  monthBoundsFromYearMonth,
  inferClosingStaffRole,
  buildClosingHubRow,
} from '../../lib/server/professorClosingAggregate.js';
import { CLOSING_STATUS_OPEN, CLOSING_STATUS_PAID } from '../../lib/professorClosing.js';

describe('monthBoundsFromYearMonth', () => {
  it('returns first and last day for October', () => {
    expect(monthBoundsFromYearMonth('2026-10')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });

  it('handles February non-leap and leap', () => {
    expect(monthBoundsFromYearMonth('2026-02')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(monthBoundsFromYearMonth('2024-02')).toEqual({
      from: '2026-02-01'.replace('2026', '2024'),
      to: '2024-02-29',
    });
  });

  it('returns null for invalid month', () => {
    expect(monthBoundsFromYearMonth('')).toBeNull();
    expect(monthBoundsFromYearMonth('2026-13')).toBeNull();
    expect(monthBoundsFromYearMonth('2026-1')).toBeNull();
    expect(monthBoundsFromYearMonth(null)).toBeNull();
  });
});

describe('inferClosingStaffRole', () => {
  it('prefers roster role when present', () => {
    expect(
      inferClosingStaffRole({
        rosterRole: 'instructor',
        asProfessor: 5,
        asInstructor: 0,
      })
    ).toBe('instructor');
    expect(
      inferClosingStaffRole({
        rosterRole: 'professor',
        asProfessor: 0,
        asInstructor: 3,
      })
    ).toBe('professor');
  });

  it('for login-only, instructor only when solely instructor appearances', () => {
    expect(
      inferClosingStaffRole({
        rosterRole: null,
        asProfessor: 0,
        asInstructor: 2,
      })
    ).toBe('instructor');
    expect(
      inferClosingStaffRole({
        rosterRole: '',
        asProfessor: 1,
        asInstructor: 2,
      })
    ).toBe('professor');
    expect(
      inferClosingStaffRole({
        asProfessor: 0,
        asInstructor: 0,
      })
    ).toBe('professor');
  });
});

describe('buildClosingHubRow', () => {
  const rates = { lesson_amount: 50, experimental_amount: 30 };

  it('builds amounts from counts and rates when open', () => {
    const row = buildClosingHubRow({
      staff_ref: 'roster:x',
      name: 'Ana',
      role: 'professor',
      counts: { lessons: 8, experimentals: 2, withdrawals: 1 },
      productDebits: [70],
      rates,
    });
    expect(row).toMatchObject({
      staff_ref: 'roster:x',
      name: 'Ana',
      role: 'professor',
      counts: { lessons: 8, experimentals: 2, withdrawals: 1 },
      amounts: {
        credits_lessons: 400,
        credits_experimental: 60,
        debits_products: 70,
        net: 390,
      },
      status: CLOSING_STATUS_OPEN,
      closing_id: null,
      finance_tx_id: null,
      post_paid_activity: false,
    });
  });

  it('uses paid snapshot amounts/counts when closing is pago', () => {
    const row = buildClosingHubRow({
      staff_ref: 'roster:x',
      name: 'Ana',
      role: 'professor',
      counts: { lessons: 10, experimentals: 5, withdrawals: 0 },
      productDebits: [],
      rates: { lesson_amount: 99, experimental_amount: 99 },
      closing: {
        $id: 'c1',
        status: CLOSING_STATUS_PAID,
        finance_tx_id: 'tx1',
        counts_json: JSON.stringify({ lessons: 8, experimentals: 2, withdrawals: 1 }),
        amounts_json: JSON.stringify({
          credits_lessons: 400,
          credits_experimental: 60,
          debits_products: 70,
          net: 390,
        }),
        role: 'instructor',
        staff_name: 'Ana Snapshot',
      },
    });
    expect(row.status).toBe(CLOSING_STATUS_PAID);
    expect(row.closing_id).toBe('c1');
    expect(row.finance_tx_id).toBe('tx1');
    expect(row.role).toBe('instructor');
    expect(row.name).toBe('Ana Snapshot');
    expect(row.counts).toEqual({ lessons: 8, experimentals: 2, withdrawals: 1 });
    expect(row.amounts).toEqual({
      credits_lessons: 400,
      credits_experimental: 60,
      debits_products: 70,
      net: 390,
    });
    expect(row.post_paid_activity).toBe(true);
  });

  it('post_paid_activity false when live matches paid snapshot', () => {
    const row = buildClosingHubRow({
      staff_ref: 'roster:x',
      name: 'Ana',
      role: 'instructor',
      counts: { lessons: 8, experimentals: 2, withdrawals: 1 },
      productDebits: [70],
      rates: { lesson_amount: 50, experimental_amount: 30 },
      closing: {
        $id: 'c1',
        status: CLOSING_STATUS_PAID,
        finance_tx_id: 'tx1',
        counts_json: JSON.stringify({ lessons: 8, experimentals: 2, withdrawals: 1 }),
        amounts_json: JSON.stringify({
          credits_lessons: 400,
          credits_experimental: 60,
          debits_products: 70,
          net: 390,
        }),
        role: 'instructor',
        staff_name: 'Ana',
      },
    });
    expect(row.post_paid_activity).toBe(false);
  });
});
