import { describe, it, expect } from 'vitest';
import {
  CSV_DELIMITER,
  escapeCsvCell,
  buildCsvContent,
  leadToCsvRow,
} from '../lib/reportsExport.js';

describe('reportsExport', () => {
  it('uses semicolon delimiter', () => {
    expect(CSV_DELIMITER).toBe(';');
    const content = buildCsvContent(['a', 'b'], [['1', '2']]);
    expect(content.startsWith('\uFEFF')).toBe(true);
    expect(content).toContain('a;b');
    expect(content).toContain('"1";"2"');
  });

  it('escapes double quotes in cells', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('leadToCsvRow omits phone when includeContact is false', () => {
    const row = leadToCsvRow({ name: 'Ana', phone: '11999999999' }, { includeContact: false });
    expect(row.telefone).toBeUndefined();
    expect(row.nome).toBe('Ana');
  });
});
