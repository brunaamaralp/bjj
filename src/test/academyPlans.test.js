import { describe, it, expect } from 'vitest';
import {
  buildPlanSelectOptions,
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
