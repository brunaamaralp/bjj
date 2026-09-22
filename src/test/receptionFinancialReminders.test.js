import { describe, it, expect } from 'vitest';
import {
  mapPayableToReceptionBucket,
  buildPayableReminders,
  buildStudentChargeReminders,
  buildPackageRenewalReminders,
  buildReceptionFinancialReminders,
  REMINDER_SECTION_LIMIT,
} from '../lib/receptionFinancialReminders.js';

describe('receptionFinancialReminders', () => {
  it('mapPayableToReceptionBucket classifica today / week / overdue', () => {
    expect(mapPayableToReceptionBucket('2026-09-22', '2026-09-22')).toBe('today');
    expect(mapPayableToReceptionBucket('2026-09-25', '2026-09-22')).toBe('week');
    expect(mapPayableToReceptionBucket('2026-09-20', '2026-09-22')).toBe('overdue');
    expect(mapPayableToReceptionBucket('2026-10-10', '2026-09-22')).toBe(null);
  });

  it('buildPayableReminders omite valor e limita a 3 por bucket na saída agregada', () => {
    const items = [
      { id: '1', vendor_label: 'Luz', due_date: '2026-09-22', amount: 200, status: 'due_soon' },
      { id: '2', vendor_label: 'Água', due_date: '2026-09-24', amount: 80, status: 'due_soon' },
      { id: '3', vendor_label: 'Aluguel', due_date: '2026-09-10', amount: 3000, status: 'overdue' },
      { id: '4', vendor_label: 'Net', due_date: '2026-09-26', amount: 100, status: 'due_soon' },
      { id: '5', vendor_label: 'Gas', due_date: '2026-09-27', amount: 50, status: 'due_soon' },
    ];
    const rows = buildPayableReminders(items, { todayYmd: '2026-09-22' });
    expect(rows.every((r) => r.amount == null && !('gross' in r))).toBe(true);
    expect(rows.find((r) => r.id === '1')).toMatchObject({
      kind: 'payable',
      label: 'Luz',
      bucket: 'today',
    });
    expect(rows.find((r) => r.id === '3').bucket).toBe('overdue');
    const week = rows.filter((r) => r.bucket === 'week');
    expect(week.length).toBeLessThanOrEqual(REMINDER_SECTION_LIMIT);
  });

  it('buildStudentChargeReminders inclui nome e valor; ignora isento/trancado', () => {
    const students = [
      { id: 's1', name: 'Maria', dueDay: 22, plan: 'Mensal' },
      { id: 's2', name: 'Isento', dueDay: 22, plan: 'Bolsista' },
      { id: 's3', name: 'Trancado', dueDay: 22, freeze_status: 'active' },
    ];
    const paymentsByLead = {
      s1: { $id: 'p1', status: 'pending', amount: 180, due_date: '2026-09-22', reference_month: '2026-09' },
    };
    const financeConfig = {
      plans: [
        { name: 'Mensal', price: 180 },
        { name: 'Bolsista', price: 0, isExempt: true },
      ],
    };
    const rows = buildStudentChargeReminders({
      students,
      paymentsByLead,
      currentMonth: '2026-09',
      today: new Date(2026, 8, 22),
      financeConfig,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'charge',
      label: 'Maria',
      bucket: 'due_today',
      amount: 180,
      studentId: 's1',
    });
  });

  it('buildPackageRenewalReminders avisa no mês e no mês anterior ao fim da cobertura', () => {
    const payments = [
      {
        $id: 'a1',
        lead_id: 's1',
        payment_category: 'bundle',
        bundle_origin_id: 'a1',
        bundle_months: 12,
        reference_month: '2025-10',
        status: 'paid',
        amount: 1800,
      },
    ];
    const studentsById = { s1: { id: 's1', name: 'João', plan_price: 1800 } };
    // cobertura: 2025-10 … 2026-09
    const inPrev = buildPackageRenewalReminders({
      payments,
      studentsById,
      todayYm: '2026-08',
    });
    expect(inPrev).toHaveLength(1);
    expect(inPrev[0]).toMatchObject({
      kind: 'renewal',
      label: 'João',
      endYm: '2026-09',
      amount: 1800,
    });

    const inEnd = buildPackageRenewalReminders({
      payments,
      studentsById,
      todayYm: '2026-09',
    });
    expect(inEnd).toHaveLength(1);

    const tooEarly = buildPackageRenewalReminders({
      payments,
      studentsById,
      todayYm: '2026-07',
    });
    expect(tooEarly).toHaveLength(0);
  });

  it('buildPackageRenewalReminders exclui se mês seguinte à cobertura já está pago', () => {
    const payments = [
      {
        $id: 'a1',
        lead_id: 's1',
        payment_category: 'bundle',
        bundle_origin_id: 'a1',
        bundle_months: 12,
        reference_month: '2025-10',
        status: 'paid',
        amount: 1800,
      },
      {
        $id: 'next',
        lead_id: 's1',
        payment_category: 'plan',
        reference_month: '2026-10',
        status: 'paid',
        amount: 180,
      },
    ];
    const rows = buildPackageRenewalReminders({
      payments,
      studentsById: { s1: { id: 's1', name: 'João' } },
      todayYm: '2026-09',
    });
    expect(rows).toHaveLength(0);
  });

  it('buildReceptionFinancialReminders agrupa seções e some se vazio', () => {
    expect(buildReceptionFinancialReminders({ payableItems: [], students: [], payments: [] }).sections).toEqual(
      []
    );
    const built = buildReceptionFinancialReminders({
      payableItems: [{ id: '1', vendor_label: 'Luz', due_date: '2026-09-22', amount: 99 }],
      students: [{ id: 's1', name: 'Maria', dueDay: 22 }],
      payments: [
        {
          $id: 'p1',
          lead_id: 's1',
          status: 'pending',
          amount: 180,
          due_date: '2026-09-22',
          reference_month: '2026-09',
          payment_category: 'plan',
        },
      ],
      todayYmd: '2026-09-22',
      currentMonth: '2026-09',
      today: new Date(2026, 8, 22),
      financeConfig: { plans: [{ name: 'Mensal', price: 180 }] },
      studentsById: { s1: { id: 's1', name: 'Maria' } },
    });
    expect(built.sections.map((s) => s.id)).toEqual(['payables', 'charges']);
    expect(built.sections[0].items[0].amount).toBeUndefined();
    expect(built.sections[1].items[0].amount).toBe(180);
  });
});
