import { describe, it, expect } from 'vitest';
import { civilMonthsOverlappingPeriod } from '../lib/closingPeriodMonths.js';

describe('civilMonthsOverlappingPeriod', () => {
  it('retorna um mês quando período está dentro do mesmo mês civil', () => {
    expect(civilMonthsOverlappingPeriod('2026-03-01', '2026-03-31')).toEqual(['2026-03']);
  });

  it('retorna dois meses quando período atravessa virada', () => {
    expect(civilMonthsOverlappingPeriod('2026-02-15', '2026-03-14')).toEqual(['2026-02', '2026-03']);
  });

  it('retorna um mês para um único dia', () => {
    expect(civilMonthsOverlappingPeriod('2026-03-31', '2026-03-31')).toEqual(['2026-03']);
  });

  it('retorna vazio para datas inválidas ou invertidas', () => {
    expect(civilMonthsOverlappingPeriod('', '2026-03-01')).toEqual([]);
    expect(civilMonthsOverlappingPeriod('2026-04-01', '2026-03-01')).toEqual([]);
    expect(civilMonthsOverlappingPeriod('bad', '2026-03-01')).toEqual([]);
  });
});
