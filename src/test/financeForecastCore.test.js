import { describe, expect, it } from 'vitest';
import { projectRecurrenceOccurrences } from '../lib/financeForecastCore.js';

describe('financeForecastCore recurrence projection', () => {
  it('projects weekly recurrence using template weekday', () => {
    const rows = projectRecurrenceOccurrences(
      {
        gross: 100,
        recurrence_type: 'weekly',
        base_date: '2026-05-06', // quarta
        label: 'Mensalidade',
        _flow: 'in',
      },
      '2026-05-01',
      '2026-05-31'
    );
    expect(rows.map((r) => r.due_date)).toEqual(['2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27']);
  });
});
