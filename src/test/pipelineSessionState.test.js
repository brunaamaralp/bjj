import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  currentMonthYm,
  pipelineSessionInitialFilters,
  pipelineSessionInitialQuickFilter,
} from '../lib/pipelineSessionState.js';

describe('pipelineSessionState defaults', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pré-seleciona o mês corrente quando não há sessão salva', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));

    expect(pipelineSessionInitialQuickFilter(null)).toBe('month');
    expect(pipelineSessionInitialFilters(null)).toMatchObject({
      enrollmentMonthFilter: '2026-06',
    });
    expect(currentMonthYm()).toBe('2026-06');
  });

  it('restaura filtros salvos sem forçar o mês corrente', () => {
    const saved = {
      activePeriodChip: 'all',
      activeFilters: {
        enrollmentMonthFilter: '',
      },
    };

    expect(pipelineSessionInitialQuickFilter(saved)).toBe(null);
    expect(pipelineSessionInitialFilters(saved)).toMatchObject({
      enrollmentMonthFilter: '',
    });
  });
});
