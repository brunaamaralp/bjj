import { describe, expect, it } from 'vitest';
import { computeMensalidadesMonthKpis } from '../lib/financeiroOverview.js';

describe('financeiroOverview', () => {
  it('nao conta aluno em plano isento nos KPIs de mensalidades', () => {
    const result = computeMensalidadesMonthKpis(
      [
        {
          id: 's1',
          name: 'Ana Bolsa',
          plan: 'Bolsista',
          dueDay: 10,
          student_status: 'active',
        },
      ],
      [],
      {
        plans: [{ name: 'Bolsista', price: 0, isExempt: true }],
      },
      '2026-06'
    );

    expect(result.activeWithPlan).toBe(0);
    expect(result.expectedTotal).toBe(0);
    expect(result.overdueCount).toBe(0);
  });
});
