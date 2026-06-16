import { describe, it, expect } from 'vitest';
import {
  buildLeadNameById,
  formatTxLeadCell,
  resolveTxLeadName,
  leadNameForExport,
} from '../lib/financeTxLeadNames.js';

describe('financeTxLeadNames', () => {
  it('prefers lead_name from transaction', () => {
    const map = buildLeadNameById([{ lead_id: 'a', lead_name: 'Maria' }], []);
    expect(map.get('a')).toBe('Maria');
    expect(resolveTxLeadName({ lead_id: 'a', lead_name: 'Maria' }, map)).toBe('Maria');
  });

  it('shows orphan fallback', () => {
    expect(formatTxLeadCell({ lead_id: 'missing' }, new Map())).toBe('Aluno não encontrado');
  });

  it('export skips orphan label', () => {
    expect(leadNameForExport({ lead_id: 'x' }, new Map())).toBe('');
  });

  it('falls back to store when tx has no lead_name', () => {
    const map = buildLeadNameById([], [{ id: 's1', name: 'João' }]);
    expect(resolveTxLeadName({ lead_id: 's1' }, map)).toBe('João');
  });

  it('formatTxLeadCell shows dash without lead_id', () => {
    expect(formatTxLeadCell({}, new Map())).toBe('—');
  });

  it('buildLeadNameById prefers tx lead_name over store', () => {
    const map = buildLeadNameById(
      [{ lead_id: 'a', lead_name: 'Da API' }],
      [{ id: 'a', name: 'Da Store' }]
    );
    expect(map.get('a')).toBe('Da API');
  });
});
