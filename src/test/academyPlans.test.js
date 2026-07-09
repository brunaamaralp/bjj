import { describe, it, expect } from 'vitest';
import {
  BUILTIN_EXEMPT_PLAN_NAME,
  buildPlanSelectOptions,
  ensureBuiltinExemptPlan,
  findPlanByName,
  normalizeImportedPlanName,
  planOptionLabel,
} from '../lib/academyPlans.js';

describe('academyPlans', () => {
  const cfg = {
    plans: [
      { name: 'Mensal', price: 200 },
      { name: 'Anual', price: 2000 },
    ],
  };

  it('formata label com preço', () => {
    expect(planOptionLabel({ name: 'Mensal', price: 200 })).toBe('Mensal · R$ 200,00');
  });

  it('formata label de plano isento', () => {
    expect(planOptionLabel({ name: 'Isento', price: 0, isExempt: true })).toBe('Isento (Isento)');
  });

  it('ensureBuiltinExemptPlan adiciona Isento quando ausente', () => {
    const plans = ensureBuiltinExemptPlan([{ name: 'Mensal', price: 200 }]);
    expect(plans.map((p) => p.name)).toEqual(['Mensal', BUILTIN_EXEMPT_PLAN_NAME]);
    expect(plans[1].isExempt).toBe(true);
  });

  it('ensureBuiltinExemptPlan nao duplica plano Isento existente', () => {
    const existing = [{ name: 'Isento', price: 0, isExempt: true }];
    expect(ensureBuiltinExemptPlan(existing)).toEqual(existing);
  });

  it('findPlanByName resolve plano Isento embutido', () => {
    const plan = findPlanByName({ plans: [{ name: 'Mensal', price: 200 }] }, 'isento');
    expect(plan?.isExempt).toBe(true);
    expect(plan?.name).toBe(BUILTIN_EXEMPT_PLAN_NAME);
  });

  it('inclui plano legado fora da lista', () => {
    const opts = buildPlanSelectOptions(cfg, 'Plano antigo');
    expect(opts[0].value).toBe('Plano antigo');
    expect(opts.some((o) => o.value === 'Mensal')).toBe(true);
  });

  it('findPlanByName é case insensitive', () => {
    expect(findPlanByName(cfg, 'mensal')?.price).toBe(200);
  });

  it('normalizeImportedPlanName alinha ao cadastro', () => {
    expect(normalizeImportedPlanName('MENSAL', cfg)).toBe('Mensal');
    expect(normalizeImportedPlanName('Plano X', cfg)).toBe('Plano X');
  });
});
