import { describe, it, expect } from 'vitest';
import { leadToSpreadsheetRow } from '../lib/exportLeadsSpreadsheet.js';

describe('leadToSpreadsheetRow', () => {
  const lead = {
    name: 'João',
    phone: '11999998888',
    type: 'Adulto',
    origin: 'Instagram',
    status: 'Novo',
    parentName: 'Maria',
    plan: 'Mensal',
    scheduledDate: '2026-06-15',
    scheduledTime: '19:00',
    createdAt: '2026-06-01T12:00:00.000Z',
  };

  it('includes all import-aligned columns', () => {
    const row = leadToSpreadsheetRow(lead);
    expect(row.Nome).toBe('João');
    expect(row.Telefone).toBe('11999998888');
    expect(row.Responsável).toBe('Maria');
    expect(row.Plano).toBe('Mensal');
    expect(row['Data Aula']).toBe('2026-06-15');
  });

  it('omits phone when includeContact is false', () => {
    const row = leadToSpreadsheetRow(lead, { includeContact: false });
    expect(row.Telefone).toBeUndefined();
    expect(row.Nome).toBe('João');
  });
});
