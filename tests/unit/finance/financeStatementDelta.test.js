import { describe, it, expect } from 'vitest';
import { buildDreCompareDelta, buildDfcCompareDelta } from '../../../src/lib/financeStatementDelta.js';
import { computeDre } from '../../../src/lib/computeDre.js';
import { computeDfc } from '../../../src/lib/computeDfc.js';
import { FINANCE_CATEGORIES } from '../../../src/lib/financeCategories.js';

describe('financeStatementDelta', () => {
  it('buildDreCompareDelta — diferença absoluta por linha', () => {
    const current = computeDre(
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
    const compare = computeDre({ month: '2026-02' }, [], []);
    const delta = buildDreCompareDelta(current, compare);
    expect(delta.lines['Receita Bruta']).toBe(1000);
    expect(delta.lines['Resultado Líquido']).toBe(1000);
    expect(delta.groups['Receita Bruta'].total).toBe(1000);
  });

  it('buildDfcCompareDelta — diferença no fluxo líquido', () => {
    const current = computeDfc(
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
    const compare = computeDfc({ from: '2026-02-01', to: '2026-02-28' }, [], []);
    const delta = buildDfcCompareDelta(current, compare);
    expect(delta.lines.variacaoCaixa).toBe(500);
    expect(delta.groups.Operacional.net).toBe(500);
  });
});
