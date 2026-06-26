import { describe, expect, it } from 'vitest';
import {
  buildStudentPlanAuditRow,
  formatStudentPlansAuditCsv,
  inferPlanFromPayments,
  indexPaymentsByStudentId,
  registeredPlanNameKeys,
  summarizeStudentPlanAudit,
} from '../lib/auditStudentPlans.js';

describe('auditStudentPlans', () => {
  it('infers plan from single payment history', () => {
    const result = inferPlanFromPayments([
      { plan_name: 'Anual adulto', reference_month: '2026-05' },
      { plan_name: 'Anual adulto', reference_month: '2026-04' },
    ]);
    expect(result.plan).toBe('Anual adulto');
    expect(result.confidence).toBe('high');
  });

  it('marks low confidence when payments conflict', () => {
    const result = inferPlanFromPayments([
      { plan_name: 'Mensal', reference_month: '2026-06' },
      { plan_name: 'Anual', reference_month: '2026-05' },
    ]);
    expect(result.confidence).toBe('low');
  });

  it('buildStudentPlanAuditRow keeps current plan', () => {
    const row = buildStudentPlanAuditRow(
      { $id: 's1', name: 'Ana', plan: 'Mensal' },
      new Map(),
      registeredPlanNameKeys([{ name: 'Mensal' }])
    );
    expect(row.confidence).toBe('current');
    expect(row.plan_final).toBe('Mensal');
    expect(row.in_catalog).toBe(true);
  });

  it('indexes payments by student id', () => {
    const map = indexPaymentsByStudentId([
      { lead_id: 'a', plan_name: 'X' },
      { student_id: 'b', plan_name: 'Y' },
    ]);
    expect(map.get('a')).toHaveLength(1);
    expect(map.get('b')).toHaveLength(1);
  });

  it('summarizes audit rows', () => {
    const summary = summarizeStudentPlanAudit([
      { student_status: 'active', plan_current: 'Mensal', plan_inferred: 'Mensal', confidence: 'current' },
      { student_status: 'active', plan_current: '', plan_inferred: 'Anual', confidence: 'high' },
      { student_status: 'inactive', plan_current: '', plan_inferred: '', confidence: 'none' },
    ]);
    expect(summary.active).toBe(2);
    expect(summary.with_current_plan).toBe(1);
    expect(summary.inferrable).toBe(1);
  });

  it('exports csv with header', () => {
    const csv = formatStudentPlansAuditCsv([
      { student_id: '1', name: 'Ana', student_status: '', plan_current: '', plan_inferred: 'Mensal', plan_final: 'Mensal', source: 'payments', confidence: 'high', in_catalog: true, payment_count: 2 },
    ]);
    expect(csv).toContain('student_id');
    expect(csv).toContain('Ana');
  });
});
