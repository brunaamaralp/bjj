import { describe, expect, it } from 'vitest';
import { parseRowsToBankItems } from '../lib/bankStatementParse.js';
import { detectSourceFormat } from '../lib/bankStatementParseXlsx.js';

describe('bankStatementParseXlsx helpers', () => {
  it('detectSourceFormat identifies extensions', () => {
    expect(detectSourceFormat('extrato.ofx')).toBe('ofx');
    expect(detectSourceFormat('extrato.csv')).toBe('csv');
    expect(detectSourceFormat('extrato.xlsx')).toBe('xlsx');
    expect(detectSourceFormat('extrato.pdf')).toBe('pdf');
  });

  it('parseRowsToBankItems maps typical BR bank columns', () => {
    const rows = [
      { Data: '15/01/2026', Descrição: 'PIX João', Valor: '150,00' },
      { Data: '16/01/2026', Descrição: 'TED Fornecedor', Valor: '-80,50' },
    ];
    const items = parseRowsToBankItems(rows, 'Data', 'Descrição', 'Valor');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      date: '2026-01-15',
      description: 'PIX João',
      amount: 150,
      direction: 'credit',
    });
    expect(items[1]).toMatchObject({
      date: '2026-01-16',
      direction: 'debit',
      amount: 80.5,
    });
  });
});
