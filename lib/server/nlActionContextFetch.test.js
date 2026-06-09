import { describe, it, expect } from 'vitest';
import {
  mergeNlRowsById,
  normalizePendingTxForNl,
  normalizePaymentForNl,
} from './nlActionContextFetch.js';

describe('nlActionContextFetch', () => {
  it('mergeNlRowsById prioriza cliente sobre servidor', () => {
    const server = [{ id: 'a', note: 'servidor', gross: 10 }];
    const client = [{ id: 'a', note: 'cliente', gross: 20 }];
    const merged = mergeNlRowsById(client, server);
    expect(merged).toHaveLength(1);
    expect(merged[0].note).toBe('cliente');
  });

  it('normalizePendingTxForNl mapeia campos', () => {
    const row = normalizePendingTxForNl({
      id: 'tx-1',
      status: 'pending',
      gross: 100,
      note: 'Teste',
    });
    expect(row.id).toBe('tx-1');
    expect(row.status).toBe('pending');
    expect(row.gross).toBe(100);
  });

  it('normalizePaymentForNl resolve nome do aluno', () => {
    const names = new Map([['s1', 'João']]);
    const row = normalizePaymentForNl(
      { id: 'p1', lead_id: 's1', reference_month: '2026-06', amount: 150, status: 'paid' },
      names
    );
    expect(row.student_name).toBe('João');
    expect(row.reference_month).toBe('2026-06');
  });
});
