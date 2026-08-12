import { describe, expect, it } from 'vitest';
import {
  detectPlanListPriceChanges,
  countStudentsOnPlan,
  buildPlanPriceChangeConfirmCopy,
} from '../lib/planListPriceChange.js';

describe('detectPlanListPriceChanges', () => {
  it('ignora planos novos (só em next)', () => {
    const saved = [{ name: 'Mensal', price: 200, isExempt: false }];
    const next = [
      { name: 'Mensal', price: 200, isExempt: false },
      { name: 'Trimestral', price: 500, isExempt: false },
    ];
    expect(detectPlanListPriceChanges(saved, next)).toEqual([]);
  });

  it('detecta mudança de preço no mesmo índice', () => {
    const saved = [{ name: 'Mensal', price: 200, isExempt: false }];
    const next = [{ name: 'Mensal', price: 250, isExempt: false }];
    expect(detectPlanListPriceChanges(saved, next)).toEqual([
      {
        index: 0,
        name: 'Mensal',
        fromPrice: 200,
        toPrice: 250,
        fromExempt: false,
        toExempt: false,
      },
    ]);
  });

  it('usa o nome novo quando renomeia e muda preço', () => {
    const saved = [{ name: 'Mensal', price: 200, isExempt: false }];
    const next = [{ name: 'Mensal 2026', price: 250, isExempt: false }];
    expect(detectPlanListPriceChanges(saved, next)[0].name).toBe('Mensal 2026');
  });

  it('detecta mudança de isenção efetiva', () => {
    const saved = [{ name: 'Bolsista', price: 0, isExempt: false }];
    const next = [{ name: 'Bolsista', price: 0, isExempt: true }];
    const changes = detectPlanListPriceChanges(saved, next);
    expect(changes).toHaveLength(1);
    expect(changes[0].fromExempt).toBe(false);
    expect(changes[0].toExempt).toBe(true);
  });

  it('não dispara só por nome ou descrição', () => {
    const saved = [{ name: 'Mensal', price: 200, description: 'a', isExempt: false }];
    const next = [{ name: 'Mensal Plus', price: 200, description: 'b', isExempt: false }];
    expect(detectPlanListPriceChanges(saved, next)).toEqual([]);
  });
});

describe('countStudentsOnPlan', () => {
  it('conta só alunos ativos com o mesmo nome de plano', () => {
    const students = [
      { plan: 'Mensal', student_status: 'active', contact_type: 'student' },
      { plan: 'Mensal', student_status: 'inactive', contact_type: 'student' },
      { plan: 'Trimestral', student_status: 'active', contact_type: 'student' },
      { plan: 'Mensal', studentStatus: 'active', _isStudent: true },
    ];
    expect(countStudentsOnPlan(students, 'Mensal')).toBe(2);
  });
});

describe('buildPlanPriceChangeConfirmCopy', () => {
  it('monta copy com contagem quando confiável', () => {
    const { title, description } = buildPlanPriceChangeConfirmCopy(
      [
        {
          name: 'Mensal',
          fromPrice: 200,
          toPrice: 250,
          fromExempt: false,
          toExempt: false,
        },
      ],
      { Mensal: 3 },
      { countsReliable: true }
    );
    expect(title).toMatch(/preço/i);
    expect(description).toMatch(/R\$\s*200/);
    expect(description).toMatch(/R\$\s*250/);
    expect(description).toMatch(/3 alunos/);
    expect(description).toMatch(/matrículas novas/i);
  });

  it('omite número quando contagem não é confiável', () => {
    const { description } = buildPlanPriceChangeConfirmCopy(
      [
        {
          name: 'Mensal',
          fromPrice: 200,
          toPrice: 250,
          fromExempt: false,
          toExempt: false,
        },
      ],
      {},
      { countsReliable: false }
    );
    expect(description).not.toMatch(/\d+ alunos/);
    expect(description).toMatch(/já matriculados/i);
  });
});
