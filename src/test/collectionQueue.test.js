import { describe, it, expect } from 'vitest';
import {
  buildCollectionQueue,
  buildPaymentsByLeadMonth,
} from '../lib/collectionQueue.js';

const financeConfig = {
  plans: [{ name: 'Mensal', price: 200 }],
};

describe('buildPaymentsByLeadMonth', () => {
  it('prefers paid over pending for same month', () => {
    const map = buildPaymentsByLeadMonth([
      { lead_id: 's1', reference_month: '2026-04', status: 'pending', $id: 'p1' },
      { lead_id: 's1', reference_month: '2026-04', status: 'paid', $id: 'p2' },
    ]);
    expect(map.get('s1|2026-04').status).toBe('paid');
  });
});

describe('buildCollectionQueue', () => {
  const today = new Date('2026-06-15T12:00:00');

  it('returns empty when no overdue students', () => {
    const out = buildCollectionQueue({
      students: [
        {
          id: 's1',
          name: 'Ana',
          plan: 'Mensal',
          dueDay: 5,
          student_status: 'active',
          converted_at: '2026-06-01',
        },
      ],
      payments: [
        {
          lead_id: 's1',
          reference_month: '2026-06',
          status: 'paid',
          amount: 200,
          paid_at: '2026-06-05',
        },
      ],
      financeConfig,
      today,
    });
    expect(out.summary.students).toBe(0);
    expect(out.rows).toHaveLength(0);
  });

  it('includes single month overdue', () => {
    const out = buildCollectionQueue({
      students: [
        {
          id: 's1',
          name: 'Ana',
          plan: 'Mensal',
          dueDay: 5,
          student_status: 'active',
          converted_at: '2026-06-01',
        },
      ],
      payments: [
        {
          lead_id: 's1',
          reference_month: '2026-06',
          status: 'pending',
          amount: 200,
          due_date: '2026-06-05',
        },
      ],
      financeConfig,
      today,
    });
    expect(out.summary.students).toBe(1);
    expect(out.rows[0].openMonths).toHaveLength(1);
    expect(out.rows[0].openMonths[0].referenceMonth).toBe('2026-06');
    expect(out.rows[0].totalOpen).toBe(200);
  });

  it('aggregates multiple months for one student', () => {
    const out = buildCollectionQueue({
      students: [
        {
          id: 's1',
          name: 'Bob',
          plan: 'Mensal',
          dueDay: 5,
          student_status: 'active',
          converted_at: '2026-04-01',
        },
      ],
      payments: [
        {
          lead_id: 's1',
          reference_month: '2026-04',
          status: 'pending',
          amount: 200,
          due_date: '2026-04-05',
        },
        {
          lead_id: 's1',
          reference_month: '2026-05',
          status: 'pending',
          amount: 200,
          due_date: '2026-05-05',
        },
      ],
      financeConfig,
      today,
    });
    expect(out.summary.students).toBe(1);
    expect(out.rows[0].openMonths.length).toBeGreaterThanOrEqual(2);
    expect(out.rows[0].totalOpen).toBeGreaterThanOrEqual(400);
    expect(out.rows[0].oldestDaysOverdue).toBeGreaterThan(30);
  });

  it('skips frozen students', () => {
    const out = buildCollectionQueue({
      students: [
        {
          id: 's1',
          name: 'Carla',
          plan: 'Mensal',
          dueDay: 5,
          student_status: 'active',
          freeze_status: 'active',
        },
      ],
      payments: [],
      financeConfig,
      today,
    });
    expect(out.rows).toHaveLength(0);
  });

  it('excludes months within paid annual bundle coverage', () => {
    const out = buildCollectionQueue({
      students: [
        {
          id: 's1',
          name: 'Eva',
          plan: 'Anual',
          dueDay: 5,
          student_status: 'active',
          converted_at: '2026-01-01',
        },
      ],
      payments: [
        {
          lead_id: 's1',
          reference_month: '2026-01',
          status: 'paid',
          amount: 2400,
          payment_category: 'bundle',
          bundle_months: 12,
          paid_at: '2026-01-05',
          $id: 'anchor-1',
          bundle_origin_id: 'anchor-1',
        },
      ],
      financeConfig: {
        plans: [{ name: 'Anual', price: 200 }],
      },
      today,
    });
    expect(out.summary.students).toBe(0);
    expect(out.rows).toHaveLength(0);
  });

  it('shows overdue only after bundle coverage ends', () => {
    const out = buildCollectionQueue({
      students: [
        {
          id: 's1',
          name: 'Eva',
          plan: 'Anual',
          dueDay: 5,
          student_status: 'active',
          converted_at: '2025-01-01',
        },
      ],
      payments: [
        {
          lead_id: 's1',
          reference_month: '2025-01',
          status: 'paid',
          amount: 2400,
          payment_category: 'bundle',
          bundle_months: 12,
          paid_at: '2025-01-05',
          $id: 'anchor-1',
          bundle_origin_id: 'anchor-1',
        },
      ],
      financeConfig: {
        plans: [{ name: 'Anual', price: 200 }],
      },
      today,
    });
    expect(out.summary.students).toBe(1);
    expect(out.rows[0].openMonths.every((m) => m.referenceMonth >= '2026-01')).toBe(true);
  });

  it('assigns collection stage from oldest overdue', () => {
    const out = buildCollectionQueue({
      students: [
        {
          id: 's1',
          name: 'Dan',
          plan: 'Mensal',
          dueDay: 5,
          student_status: 'active',
          converted_at: '2026-04-01',
        },
      ],
      payments: [
        {
          lead_id: 's1',
          reference_month: '2026-04',
          status: 'pending',
          amount: 200,
          due_date: '2026-04-05',
        },
      ],
      financeConfig,
      today,
    });
    expect(out.rows[0].stage?.day).toBeGreaterThanOrEqual(15);
  });
});
