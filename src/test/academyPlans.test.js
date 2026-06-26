import { describe, it, expect } from 'vitest';
import {
  buildPlanSelectOptions,
  findPlanByName,
  normalizeImportedPlanName,
  planOptionLabel,
  resolveStudentPlanDisplayName,
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

  it('inclui opção vazia quando allowEmpty', () => {
    const opts = buildPlanSelectOptions(cfg, '', { allowEmpty: true });
    expect(opts[0]).toEqual({ value: '', label: 'Sem plano', plan: null });
    expect(opts.some((o) => o.value === 'Mensal')).toBe(true);
  });

  it('resolveStudentPlanDisplayName formata com preço', () => {
    expect(resolveStudentPlanDisplayName(cfg, 'Mensal')).toBe('Mensal · R$ 200,00');
    expect(resolveStudentPlanDisplayName(cfg, '')).toBe('');
    expect(resolveStudentPlanDisplayName(cfg, 'Legado')).toBe('Legado');
  });
});
