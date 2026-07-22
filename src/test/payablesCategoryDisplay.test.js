import { describe, it, expect } from 'vitest';
import { formatPayableCategoryLabel, payableCategoryFilterOptions } from '../lib/payablesCategoryDisplay.js';
import { getCategoryOptionsByNature } from '../lib/financeCategories.js';

const accounts = [
  { code: '6.2.5', name: 'Energia elétrica', type: 'despesa', dreGrupo: 'Despesas Operacionais', isActive: true },
  { code: '6.2.6', name: 'Água', type: 'despesa', dreGrupo: 'Despesas Operacionais', isActive: true },
];

describe('payablesCategoryDisplay', () => {
  it('resolve acct:CODE para label do plano', () => {
    expect(formatPayableCategoryLabel('acct:6.2.5', accounts)).toMatch(/Energia/i);
  });

  it('filtro lista as mesmas opções de saída dos lançamentos', () => {
    const groups = getCategoryOptionsByNature('out', accounts);
    const filter = payableCategoryFilterOptions(groups);
    const values = filter.map((o) => o.value);
    expect(values).toContain('acct:6.2.5');
    expect(values).toContain('Outras despesas');
  });
});
