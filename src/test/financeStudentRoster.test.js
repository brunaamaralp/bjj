import { describe, expect, it } from 'vitest';
import {
  effectiveStudentPlan,
  isMatriculatedPersonDoc,
  mapLeadDocToStudentShape,
  mergeMatriculatedPersonDocs,
} from '../lib/financeStudentRoster.js';

describe('financeStudentRoster', () => {
  it('effectiveStudentPlan usa cadastro ou pagamento', () => {
    expect(effectiveStudentPlan({ plan: 'Mensal' }, null)).toBe('Mensal');
    expect(effectiveStudentPlan({ plan: '' }, { plan_name: 'Anual adulto' })).toBe('Anual adulto');
  });

  it('isMatriculatedPersonDoc reconhece matriculado', () => {
    expect(isMatriculatedPersonDoc({ status: 'Matriculado' })).toBe(true);
    expect(isMatriculatedPersonDoc({ contact_type: 'student' })).toBe(true);
    expect(isMatriculatedPersonDoc({ status: 'Novo lead' })).toBe(false);
  });

  it('mergeMatriculatedPersonDocs prioriza students', () => {
    const merged = mergeMatriculatedPersonDocs(
      [{ $id: 's1', plan: 'Do students', status: 'Matriculado' }],
      [{ $id: 's1', plan: 'Do leads', status: 'Matriculado' }, { $id: 's2', status: 'Matriculado' }]
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((d) => d.$id === 's1')?.plan).toBe('Do students');
  });

  it('mapLeadDocToStudentShape inclui plan', () => {
    const row = mapLeadDocToStudentShape({
      $id: 'lead1',
      name: 'Ana',
      status: 'Matriculado',
      plan: 'Plano Mensal',
    });
    expect(row.id).toBe('lead1');
    expect(row.plan).toBe('Plano Mensal');
    expect(row._isStudent).toBe(true);
  });
});
