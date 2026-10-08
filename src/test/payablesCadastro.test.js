import { describe, expect, it } from 'vitest';
import {
  addMonthsYm,
  buildCadastroMonthWindow,
  buildPayablesCadastroGrid,
  selectActiveCadastroTemplates,
  CADASTRO_CELL,
} from '../lib/payablesCadastro.js';

describe('payablesCadastro', () => {
  it('buildCadastroMonthWindow: 6 past + current + 2 future', () => {
    const months = buildCadastroMonthWindow('2026-10-08');
    expect(months).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });

  it('addMonthsYm crosses year boundary', () => {
    expect(addMonthsYm('2026-01', -1)).toBe('2025-12');
    expect(addMonthsYm('2026-11', 2)).toBe('2027-01');
  });

  it('selectActiveCadastroTemplates skips cancelled and sorts by day', () => {
    const rows = selectActiveCadastroTemplates([
      {
        id: 'b',
        is_recurrence_template: true,
        status: 'pending',
        direction: 'out',
        recurrence_type: 'monthly',
        recurrence_day: 20,
        planName: 'INSS',
        category: 'Impostos e taxas',
        gross: 100,
      },
      {
        id: 'a',
        is_recurrence_template: true,
        status: 'pending',
        direction: 'out',
        recurrence_type: 'monthly',
        recurrence_day: 9,
        planName: 'Aluguel',
        category: 'Aluguel do espaço',
        gross: 2500,
      },
      {
        id: 'c',
        is_recurrence_template: true,
        status: 'cancelled',
        direction: 'out',
        recurrence_type: 'monthly',
        recurrence_day: 15,
        planName: 'Netwise',
        gross: 100,
      },
    ]);
    expect(rows.map((r) => r.vendor_label)).toEqual(['Aluguel', 'INSS']);
    expect(rows[0].statusLabel).toBe('Ativo');
  });

  it('buildPayablesCadastroGrid classifies paid / overdue / open / empty', () => {
    const grid = buildPayablesCadastroGrid({
      today: '2026-10-08',
      templates: [
        {
          id: 'tpl-1',
          is_recurrence_template: true,
          status: 'pending',
          direction: 'out',
          recurrence_type: 'monthly',
          recurrence_day: 9,
          planName: 'Aluguel',
          category: 'Aluguel do espaço',
          gross: 2500,
        },
      ],
      instances: [
        {
          id: 's1',
          recurrence_origin_id: 'tpl-1',
          status: 'settled',
          competence_month: '2026-09',
          gross: 2500,
          settledAt: '2026-09-09T12:00:00.000Z',
        },
        {
          id: 'p1',
          recurrence_origin_id: 'tpl-1',
          status: 'pending',
          competence_month: '2026-10',
          due_date: '2026-10-09',
          gross: 2500,
        },
        {
          id: 'p2',
          recurrence_origin_id: 'tpl-1',
          status: 'pending',
          competence_month: '2026-08',
          due_date: '2026-08-09',
          gross: 2500,
        },
      ],
    });

    expect(grid.activeCount).toBe(1);
    expect(grid.months).toHaveLength(9);
    const row = grid.rows[0];
    expect(row.cells['2026-09'].state).toBe(CADASTRO_CELL.PAID);
    expect(row.cells['2026-10'].state).toBe(CADASTRO_CELL.OPEN);
    expect(row.cells['2026-08'].state).toBe(CADASTRO_CELL.OVERDUE);
    expect(row.cells['2026-04'].state).toBe(CADASTRO_CELL.EMPTY);
    expect(row.cells['2026-11'].state).toBe(CADASTRO_CELL.EMPTY);
  });

  it('settled wins over pending in same month', () => {
    const grid = buildPayablesCadastroGrid({
      today: '2026-10-08',
      templates: [
        {
          id: 'tpl-1',
          is_recurrence_template: true,
          status: 'pending',
          direction: 'out',
          recurrence_type: 'monthly',
          recurrence_day: 5,
          planName: 'Franquia',
          gross: 657,
        },
      ],
      instances: [
        {
          id: 'p',
          recurrence_origin_id: 'tpl-1',
          status: 'pending',
          competence_month: '2026-10',
          due_date: '2026-10-05',
          gross: 657,
        },
        {
          id: 's',
          recurrence_origin_id: 'tpl-1',
          status: 'settled',
          competence_month: '2026-10',
          gross: 657,
        },
      ],
    });
    expect(grid.rows[0].cells['2026-10'].state).toBe(CADASTRO_CELL.PAID);
  });
});
