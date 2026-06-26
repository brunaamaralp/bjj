import { describe, it, expect, vi } from 'vitest';
import {
  buildMensalidadesFilterCounts,
  matchesMensalidadesStatusFilter,
  matchesMensalidadesStudentFilters,
  parseMensalidadesFiltroParam,
} from '../lib/mensalidadesFilters.js';

vi.mock('../lib/collectionOverdue.js', () => ({
  getReceptionDueBucket: vi.fn(() => 'overdue'),
}));

import { getReceptionDueBucket } from '../lib/collectionOverdue.js';

describe('mensalidadesFilters', () => {
  it('parseMensalidadesFiltroParam accepts extended keys', () => {
    expect(parseMensalidadesFiltroParam('covered')).toBe('covered');
    expect(parseMensalidadesFiltroParam('frozen')).toBe('frozen');
    expect(parseMensalidadesFiltroParam('paid_in_month')).toBe('paid_in_month');
    expect(parseMensalidadesFiltroParam('regua_7')).toBe('regua_7');
    expect(parseMensalidadesFiltroParam('invalid')).toBe('all');
  });

  it('buildMensalidadesFilterCounts includes frozen and paid_in_month', () => {
    const counts = buildMensalidadesFilterCounts(
      [{ id: '1' }, { id: '2' }, { id: '3' }],
      (s) => (s.id === '1' ? 'paid' : s.id === '2' ? 'covered' : 'frozen')
    );
    expect(counts.paid).toBe(1);
    expect(counts.covered).toBe(1);
    expect(counts.frozen).toBe(1);
    expect(counts.paid_in_month).toBe(2);
  });

  it('paid_in_month matches paid and covered', () => {
    expect(
      matchesMensalidadesStatusFilter({
        filter: 'paid_in_month',
        statusKey: 'covered',
        student: { id: 'a' },
      })
    ).toBe(true);
    expect(
      matchesMensalidadesStatusFilter({
        filter: 'paid',
        statusKey: 'covered',
        student: { id: 'a' },
      })
    ).toBe(false);
  });

  it('overdue uses reception bucket', () => {
    getReceptionDueBucket.mockReturnValueOnce('overdue');
    expect(
      matchesMensalidadesStatusFilter({
        filter: 'overdue',
        statusKey: 'soon',
        student: { id: 'a' },
        payment: null,
        currentMonth: '2026-06',
        financeConfig: {},
      })
    ).toBe(true);
  });

  it('matchesMensalidadesStudentFilters by plan', () => {
    expect(
      matchesMensalidadesStudentFilters({
        student: { name: 'Ana', plan: 'Mensal', turma: 'Adulto' },
        planFilter: 'Mensal',
      })
    ).toBe(true);
    expect(
      matchesMensalidadesStudentFilters({
        student: { name: 'Ana', plan: 'Mensal' },
        planFilter: 'Trimestral',
      })
    ).toBe(false);
  });

  it('unifica GBK Juniores com Juniores em turma e plano', () => {
    expect(
      matchesMensalidadesStudentFilters({
        student: { name: 'João', turma: 'GBK Juniores' },
        turmaFilter: 'Juniores',
      })
    ).toBe(true);
    expect(
      matchesMensalidadesStudentFilters({
        student: { name: 'Maria', plan: 'GBK Juniores' },
        planFilter: 'Juniores',
      })
    ).toBe(true);
  });
});
