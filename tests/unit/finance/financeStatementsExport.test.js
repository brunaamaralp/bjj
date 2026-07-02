import { describe, it, expect } from 'vitest';
import { buildDfcCsvMatrix, buildDreCsvMatrix } from '../../../src/lib/financeStatementsExport.js';
import { computeDre } from '../../../src/lib/computeDre.js';
import { computeDfc } from '../../../src/lib/computeDfc.js';
import { FINANCE_CATEGORIES } from '../../../src/lib/financeCategories.js';

describe('financeStatementsExport', () => {
  it('buildDreCsvMatrix — inclui totais e categorias', () => {
    const statement = computeDre(
      { month: '2026-03' },
      [
        {
          status: 'settled',
          type: 'plan',
          category: FINANCE_CATEGORIES.MENSALIDADE.label,
          competence_month: '2026-03',
          settledAt: '2026-03-10T12:00:00.000Z',
          gross: 1000,
          fee: 0,
          net: 1000,
          direction: 'in',
        },
      ],
      []
    );
    const { headers, rows, filename } = buildDreCsvMatrix({
      month: '2026-03',
      statement,
      delta: { lines: { 'Receita Bruta': 1000 } },
    });
    expect(headers[0]).toBe('Grupo');
    expect(filename).toBe('dre-2026-03.csv');
    expect(rows.some((r) => r[0] === 'Receita Bruta' && r[2] === '1000,00')).toBe(true);
  });

  it('buildDfcCsvMatrix — inclui entradas, saídas e variação', () => {
    const statement = computeDfc(
      { from: '2026-03-01', to: '2026-03-31' },
      [
        {
          status: 'settled',
          type: 'plan',
          category: FINANCE_CATEGORIES.MENSALIDADE.label,
          settledAt: '2026-03-10T12:00:00.000Z',
          gross: 500,
          fee: 0,
          net: 500,
          direction: 'in',
        },
      ],
      []
    );
    const { headers, rows } = buildDfcCsvMatrix({
      month: '2026-03',
      statement,
      delta: { lines: { variacaoCaixa: 500 }, groups: { Operacional: { net: 500 } } },
    });
    expect(headers).toContain('Entradas (R$)');
    expect(rows.some((r) => r[0] === 'Variação de caixa' && r[4] === '500,00')).toBe(true);
  });
});
