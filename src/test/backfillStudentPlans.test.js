import { describe, expect, it } from 'vitest';
import {
  buildBackfillPlanUpdates,
  canonicalizePlanName,
  inferPlanFromPaymentAmount,
  mapLegacyPlanName,
  parseAssignCsv,
  parseLegacyPlanMapCsv,
} from '../lib/backfillStudentPlans.js';

const PLANS = [
  { name: 'Plano Anual Adulto', price: 289 },
  { name: 'Plano Mensal Infantil', price: 319 },
];

const LEGACY = parseLegacyPlanMapCsv(`legacy_name,student_type,canonical_plan
Anual adulto,,Plano Anual Adulto
Mensal,Criança,Plano Mensal Infantil`);

describe('backfillStudentPlans', () => {
  it('parseAssignCsv reads plan_final', () => {
    const rows = parseAssignCsv('student_id,plan_final\nabc,Plano Anual Adulto');
    expect(rows).toEqual([{ student_id: 'abc', plan_final: 'Plano Anual Adulto', source: 'csv' }]);
  });

  it('mapLegacyPlanName respects student type', () => {
    expect(mapLegacyPlanName('Mensal', 'Criança', LEGACY)).toBe('Plano Mensal Infantil');
    expect(mapLegacyPlanName('Anual adulto', 'Adulto', LEGACY)).toBe('Plano Anual Adulto');
  });

  it('canonicalizePlanName maps legacy to catalog', () => {
    const out = canonicalizePlanName('Anual adulto', { type: 'Adulto' }, LEGACY, PLANS);
    expect(out.plan).toBe('Plano Anual Adulto');
    expect(out.mapped).toBe(true);
  });

  it('infers plan from payment amount for adulto', () => {
    const hit = inferPlanFromPaymentAmount(289, { type: 'Adulto' });
    expect(hit.plan).toBe('Plano Anual Adulto');
    expect(hit.confidence).toBe('high');
  });

  it('infers annual adulto from full bundle 3468 (12×289)', () => {
    const hit = inferPlanFromPaymentAmount(3468, { type: 'Adulto' });
    expect(hit.plan).toBe('Plano Anual Adulto');
    expect(hit.confidence).toBe('high');
  });

  it('infers annual infantil from full bundle 2868 (12×239)', () => {
    const hit = inferPlanFromPaymentAmount(2868, { type: 'Criança' });
    expect(hit.plan).toBe('Plano Anual Infantil');
    expect(hit.confidence).toBe('high');
  });

  it('uses bundle_months when parcela mensal is ambígua', () => {
    const hit = inferPlanFromPaymentAmount(3468, { type: 'Adulto' }, { bundleMonths: 12 });
    expect(hit.plan).toBe('Plano Anual Adulto');
  });

  it('buildBackfillPlanUpdates applies csv assignments', () => {
    const students = [{ $id: 's1', name: 'Ana', type: 'Adulto' }];
    const { toUpdate, skipped } = buildBackfillPlanUpdates({
      students,
      assignRows: [{ student_id: 's1', plan_final: 'Plano Anual Adulto', source: 'csv' }],
      registeredPlans: PLANS,
      minConfidence: 'high',
    });
    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0].plan_to).toBe('Plano Anual Adulto');
    expect(skipped).toHaveLength(0);
  });

  it('skips when plan already matches', () => {
    const students = [{ $id: 's1', name: 'Ana', plan: 'Plano Anual Adulto' }];
    const { toUpdate, skipped } = buildBackfillPlanUpdates({
      students,
      assignRows: [{ student_id: 's1', plan_final: 'Plano Anual Adulto', source: 'csv' }],
      registeredPlans: PLANS,
    });
    expect(toUpdate).toHaveLength(0);
    expect(skipped[0].reason).toBe('unchanged');
  });
});
