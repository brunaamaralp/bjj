import { describe, it, expect } from 'vitest';
import {
  buildWeekRanges,
  findWeekIndex,
  pushForecastItem,
  finalizeWeeks,
  projectRecurrenceOccurrences,
  FORECAST_PERIOD_PRESETS,
} from '../lib/financeForecastCore.js';

describe('financeForecastCore', () => {
  it('gera semanas de segunda a domingo no intervalo', () => {
    const weeks = buildWeekRanges('2026-05-04', '2026-05-20');
    expect(weeks.length).toBeGreaterThan(0);
    expect(weeks[0].week_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(weeks[0].items).toEqual([]);
  });

  it('agrupa item na semana correta', () => {
    const weeks = buildWeekRanges('2026-05-01', '2026-05-31');
    pushForecastItem(weeks, {
      type: 'mensalidade',
      label: 'Teste',
      amount: 100,
      due_date: '2026-05-15',
      status: 'esperado',
      _flow: 'in',
    });
    finalizeWeeks(weeks);
    const idx = findWeekIndex(weeks, '2026-05-15');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(weeks[idx].expected_inflow).toBe(100);
  });

  it('projeta recorrência mensal', () => {
    const occ = projectRecurrenceOccurrences(
      { gross: 50, recurrence_day: 10, label: 'Aluguel', _flow: 'out' },
      '2026-05-01',
      '2026-06-30'
    );
    expect(occ.length).toBeGreaterThanOrEqual(2);
    expect(occ[0].type).toBe('recorrencia');
    expect(occ[0].amount).toBe(50);
  });

  it('presets de período retornam from/to', () => {
    const p4 = FORECAST_PERIOD_PRESETS['4w']('2026-05-01');
    expect(p4.from).toBe('2026-05-01');
    expect(p4.to).toBe('2026-05-28');
  });
});
