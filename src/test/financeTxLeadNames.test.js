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
});
