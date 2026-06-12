import { describe, it, expect } from 'vitest';
import { financeTxToCsvRow, applyFinanceTxFilters } from '../lib/financeTxExport.js';

describe('financeTxToCsvRow', () => {
  it('maps transaction fields for CSV export', () => {
    const row = financeTxToCsvRow(
      {
        id: 'tx1',
        status: 'settled',
        type: 'plan',
        planName: 'Mensal',
        method: 'pix',
        gross: 350,
        fee: 0,
        lead_id: 's1',
        competence_month: '2026-06',
        note: 'Junho',
        settledAt: '2026-06-15T12:00:00.000Z',
        category: 'Mensalidades',
      },
      { leadName: 'João Silva' }
    );
    expect(row.aluno).toBe('João Silva');
    expect(row.status).toBe('Liquidado');
    expect(row.direcao).toBe('Entrada');
    expect(row.competencia).toBe('2026-06');
    expect(row.valor_bruto).toBe('350,00');
  });
});

describe('applyFinanceTxFilters', () => {
  const txs = [
    { id: '1', status: 'settled', type: 'plan', gross: 100, lead_id: 'a', category: 'Mensalidades' },
    { id: '2', status: 'pending', type: 'expense', gross: 50, lead_id: 'b', category: 'Marketing' },
  ];
  const leadNameById = new Map([
    ['a', 'Ana'],
    ['b', 'Bruno'],
  ]);

  it('filters by status', () => {
    const out = applyFinanceTxFilters(txs, { statusFilter: 'pending' }, leadNameById);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('2');
  });

  it('filters by search query on student name', () => {
    const out = applyFinanceTxFilters(txs, { search: 'ana' }, leadNameById);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1');
  });
});
