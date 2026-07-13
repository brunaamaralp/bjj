import { describe, it, expect } from 'vitest';
import {
  financeTxDedupKey,
  normalizeImportStudentName,
  markFinanceTxImportDuplicates,
  collectExistingFinanceTxDedupKeys,
  monthsInDateRange,
  rowToFinanceTxData,
} from '../lib/financeTxImport.js';

describe('financeTxDedupKey', () => {
  it('builds key from date, amount and student name', () => {
    expect(
      financeTxDedupKey({
        dateIso: '2025-05-15T12:00:00.000Z',
        amount: 350,
        studentName: 'João Silva',
      })
    ).toBe('2025-05-15|350.00|joao silva');
  });

  it('returns null without student name', () => {
    expect(
      financeTxDedupKey({
        dateIso: '2025-05-15T12:00:00.000Z',
        amount: 350,
        studentName: '',
      })
    ).toBeNull();
  });

  it('normalizes accents and casing', () => {
    expect(normalizeImportStudentName('  JOÃO   SILVA  ')).toBe('joao silva');
  });
});

describe('markFinanceTxImportDuplicates', () => {
  const readyRow = (id, ymd, amount, studentName) => ({
    id,
    status: 'ready',
    selected: true,
    data: {
      dateIso: `${ymd}T12:00:00.000Z`,
      amount,
      studentName,
    },
  });

  it('marks existing system duplicate and deselects', () => {
    const existing = new Set(['2025-05-15|350.00|joao silva']);
    const rows = [readyRow('r0', '2025-05-15', 350, 'João Silva')];
    const out = markFinanceTxImportDuplicates(rows, existing);
    expect(out[0].status).toBe('duplicate');
    expect(out[0].selected).toBe(false);
    expect(out[0].duplicateReason).toBe('existing');
  });

  it('marks second row in file as duplicate', () => {
    const rows = [
      readyRow('r0', '2025-05-15', 350, 'Maria'),
      readyRow('r1', '2025-05-15', 350, 'Maria'),
    ];
    const out = markFinanceTxImportDuplicates(rows, new Set());
    expect(out[0].status).toBe('ready');
    expect(out[1].status).toBe('duplicate');
    expect(out[1].duplicateReason).toBe('file');
  });
});

describe('collectExistingFinanceTxDedupKeys', () => {
  it('includes settled finance tx and paid student payment', () => {
    const keys = collectExistingFinanceTxDedupKeys({
      studentNameById: { lead1: 'Ana Costa' },
      transactions: [
        {
          status: 'settled',
          lead_id: 'lead1',
          gross: 200,
          settledAt: '2025-04-10T15:00:00.000Z',
        },
      ],
      payments: [
        {
          status: 'paid',
          lead_id: 'lead1',
          amount: 200,
          paid_at: '2025-04-10T18:00:00.000Z',
        },
      ],
    });
    expect(keys.has('2025-04-10|200.00|ana costa')).toBe(true);
  });
});

describe('monthsInDateRange', () => {
  it('lists months spanned by range', () => {
    expect(monthsInDateRange('2025-01-28', '2025-03-02')).toEqual(['2025-01', '2025-02', '2025-03']);
  });
});

describe('parseMethodCell via rowToFinanceTxData', () => {
  const columnToField = { Forma: 'method', Data: 'date', Valor: 'amount' };

  it('reconhece cartão de crédito em variantes comuns', () => {
    const cases = [
      'Cartão de crédito',
      'Maquininha',
      'Parcelado 3x',
      'VISA crédito',
      'cartão_crédito',
    ];
    for (const forma of cases) {
      const data = rowToFinanceTxData(
        { Forma: forma, Data: '15/05/2025', Valor: '100' },
        columnToField
      );
      expect(data.method, forma).toBe('cartao_credito');
    }
  });

  it('não classifica PIX como outro', () => {
    const data = rowToFinanceTxData(
      { Forma: 'PIX', Data: '15/05/2025', Valor: '100' },
      columnToField
    );
    expect(data.method).toBe('pix');
  });
});
