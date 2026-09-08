import { describe, expect, it } from 'vitest';
import { missingSeedAccounts } from '../../../src/lib/financeChartSeedAccounts.js';

describe('missingSeedAccounts', () => {
  it('retorna seeds cujo código ainda não existe', () => {
    const existing = [{ code: '1.1.1' }, { code: '6.2.1' }];
    const seeds = [
      { code: '1.1.1', name: 'Caixa' },
      { code: '6.2.1', name: 'Despesas Gerais' },
      { code: '6.2.3', name: 'Limpeza e higiene' },
      { code: '4.1.2', name: 'Aulas avulsas / day pass' },
    ];
    const missing = missingSeedAccounts(existing, seeds);
    expect(missing.map((a) => a.code)).toEqual(['6.2.3', '4.1.2']);
  });

  it('não renomeia / não recria código já presente', () => {
    const existing = [{ code: '4.1.2', name: 'Mensalidades premium' }];
    const seeds = [{ code: '4.1.2', name: 'Aulas avulsas / day pass' }];
    expect(missingSeedAccounts(existing, seeds)).toEqual([]);
  });
});
