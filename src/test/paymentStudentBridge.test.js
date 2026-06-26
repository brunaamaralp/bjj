import { describe, expect, it } from 'vitest';
import {
  buildLeadIdToPhoneMap,
  buildOrphanLeadRepairPlan,
  buildPaymentPlanNameSyncPlan,
  buildPhoneToStudentIdMap,
  indexPaymentsByResolvedStudentId,
  parseOrphanLeadMapCsv,
  paymentPlanMatchesStudentPlan,
  resolvePaymentToStudentId,
} from '../lib/paymentStudentBridge.js';

describe('paymentStudentBridge', () => {
  const students = [
    { $id: 'student-new', phone: '5511999887766' },
    { $id: 'student-2', phone_number: '5521988776655' },
  ];

  it('maps lead_id via conversation phone to current student', () => {
    const leadToPhone = buildLeadIdToPhoneMap([
      { lead_id: 'old-lead-1', phone_number: '+55 (11) 99988-7766' },
    ]);
    const phoneToStudent = buildPhoneToStudentIdMap(students);
    const studentIds = new Set(students.map((s) => s.$id));

    const sid = resolvePaymentToStudentId(
      { lead_id: 'old-lead-1' },
      { leadToPhone, phoneToStudent, studentIds }
    );
    expect(sid).toBe('student-new');
  });

  it('prefers direct student_id when still valid', () => {
    const leadToPhone = new Map();
    const phoneToStudent = buildPhoneToStudentIdMap(students);
    const studentIds = new Set(students.map((s) => s.$id));

    const sid = resolvePaymentToStudentId(
      { student_id: 'student-2' },
      { leadToPhone, phoneToStudent, studentIds }
    );
    expect(sid).toBe('student-2');
  });

  it('indexes payments by resolved student id', () => {
    const conversations = [{ lead_id: 'orphan', phone_number: '21988776655' }];
    const payments = [
      { $id: 'p1', lead_id: 'orphan', amount: 330 },
      { $id: 'p2', student_id: 'student-new', amount: 289 },
    ];
    const map = indexPaymentsByResolvedStudentId(
      payments,
      students,
      buildLeadIdToPhoneMap(conversations)
    );
    expect(map.get('student-2')?.length).toBe(1);
    expect(map.get('student-new')?.length).toBe(1);
  });

  it('buildOrphanLeadRepairPlan maps financial_tx name and manual csv', () => {
    const students = [{ $id: 's-laura', name: 'Laura Silva', phone: '37999999999' }];
    const payments = [{ $id: 'p1', lead_id: 'orphan-1', amount: 319 }];
    const financialTx = [{ $id: 'f1', lead_id: 'orphan-1', planName: 'Laura Silva — Mensal Infantil' }];
    const manual = parseOrphanLeadMapCsv('orphan_lead_id,student_id\norphan-2,s-laura');

    const plan = buildOrphanLeadRepairPlan({
      students,
      payments: [...payments, { $id: 'p2', lead_id: 'orphan-2', amount: 3468 }],
      conversations: [],
      financialTx,
      manualRows: manual,
    });

    expect(plan.stats.mapped_lead_ids).toBe(2);
    expect(plan.mappings.find((m) => m.orphan_lead_id === 'orphan-1')?.student_id).toBe('s-laura');
    expect(plan.mappings.find((m) => m.orphan_lead_id === 'orphan-2')?.source).toBe('manual');
    expect(plan.stats.payments_to_repair).toBe(2);
  });

  it('paymentPlanMatchesStudentPlan usa plan do cadastro', () => {
    const legacy = [
      { legacy_name: 'Anual', student_type: 'adulto', canonical_plan: 'Anual adulto' },
    ];
    const student = { $id: 's1', plan: 'Anual adulto', student_type: 'adulto' };
    expect(paymentPlanMatchesStudentPlan('Anual adulto', student, legacy)).toBe(true);
    expect(paymentPlanMatchesStudentPlan('Anual', student, legacy)).toBe(true);
    expect(paymentPlanMatchesStudentPlan('Mensal', student, legacy)).toBe(false);
  });

  it('buildOrphanLeadRepairPlan mapeia por plano + nome da conversa', () => {
    const students = [
      { $id: 's-ana', name: 'Ana Silva', plan: 'Mensal adulto', student_type: 'adulto' },
      { $id: 's-bia', name: 'Bia Costa', plan: 'Anual infantil', student_type: 'infantil' },
    ];
    const plan = buildOrphanLeadRepairPlan({
      students,
      payments: [{ $id: 'p1', lead_id: 'orphan-plan', plan_name: 'Mensal adulto', amount: 289 }],
      conversations: [{ lead_id: 'orphan-plan', lead_name: 'Ana Silva' }],
      financialTx: [],
      manualRows: [],
    });
    expect(plan.mappings.find((m) => m.orphan_lead_id === 'orphan-plan')?.student_id).toBe('s-ana');
    expect(plan.mappings.find((m) => m.orphan_lead_id === 'orphan-plan')?.source).toBe('student_plan_and_name');
  });

  it('buildOrphanLeadRepairPlan não mapeia só por plano sem desambiguação', () => {
    const students = [{ $id: 's-miguel', name: 'Miguel', plan: 'Plano Anual Adulto', student_type: 'adulto' }];
    const plan = buildOrphanLeadRepairPlan({
      students,
      payments: [{ $id: 'p1', lead_id: 'orphan-only-plan', plan_name: 'Anual adulto', amount: 3468 }],
      conversations: [],
      financialTx: [],
      manualRows: [],
    });
    expect(plan.mappings.find((m) => m.orphan_lead_id === 'orphan-only-plan')).toBeUndefined();
  });

  it('buildPaymentPlanNameSyncPlan copia plan do aluno para plan_name vazio', () => {
    const students = [{ $id: 's1', name: 'João', plan: 'Mensal adulto' }];
    const payments = [
      { $id: 'p1', lead_id: 's1', plan_name: '' },
      { $id: 'p2', lead_id: 's1', plan_name: 'Legado' },
    ];
    const rows = buildPaymentPlanNameSyncPlan(payments, students);
    expect(rows).toHaveLength(1);
    expect(rows[0].payment_id).toBe('p1');
    expect(rows[0].plan_name_after).toBe('Mensal adulto');
  });
});
