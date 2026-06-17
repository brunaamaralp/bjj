import { describe, it, expect } from 'vitest';
import {
  normalizeFinanceVendor,
  normalizeFinanceVendors,
  findFinanceVendorByName,
  activeFinanceVendors,
} from '../lib/financeVendors.js';
import { trimPayablesForOverview } from '../lib/financeiroOverview.js';
import { PAYABLE_SOURCE } from '../lib/payablesAggregate.js';
import {
  mapPayablesImportColumns,
  buildPayablesImportPreviewRows,
  payableImportRowToPayload,
  payablesImportMatchKey,
  markPayablesImportDuplicates,
  collectPayablesImportExistingKeys,
} from '../lib/payablesImport.js';

describe('financeVendors', () => {
  it('normalizes vendor with defaults', () => {
    const v = normalizeFinanceVendor({
      name: 'CPFL',
      defaultCategory: 'Luz / energia',
      defaultDueDay: 10,
    });
    expect(v.name).toBe('CPFL');
    expect(v.defaultCategory).toBe('Luz / energia');
    expect(v.defaultDueDay).toBe(10);
    expect(v.active).toBe(true);
  });

  it('dedupes vendors by name', () => {
    const list = normalizeFinanceVendors([
      { id: '1', name: 'Sabesp' },
      { id: '2', name: 'sabesp' },
    ]);
    expect(list).toHaveLength(1);
  });

  it('finds vendor by name case-insensitive', () => {
    const cfg = { vendors: [{ id: 'a', name: 'Vivo', defaultDueDay: 5 }] };
    expect(findFinanceVendorByName(cfg, 'vivo')?.defaultDueDay).toBe(5);
    expect(activeFinanceVendors(cfg)).toHaveLength(1);
  });
});

describe('trimPayablesForOverview', () => {
  it('excludes template rows from top items', () => {
    const trimmed = trimPayablesForOverview({
      summary: { totalOpen: 100 },
      items: [
        { id: '1', source: PAYABLE_SOURCE.LANCAMENTO, vendor_label: 'CPFL', due_date: '2026-06-10', amount: 50 },
        { id: '2', source: PAYABLE_SOURCE.TEMPLATE, vendor_label: 'Sabesp', due_date: '2026-06-12', amount: 30 },
      ],
    });
    expect(trimmed.topItems).toHaveLength(1);
    expect(trimmed.topItems[0].vendor_label).toBe('CPFL');
  });
});

describe('payablesImport', () => {
  it('maps headers and builds valid preview row', () => {
    const map = mapPayablesImportColumns([
      'fornecedor',
      'categoria',
      'valor',
      'vencimento',
      'recorrente',
    ]);
    const rows = buildPayablesImportPreviewRows(
      [['CPFL', 'Luz / energia', '450,00', '10/06/2026', 'sim']],
      map
    );
    expect(rows[0].valid).toBe(true);
    expect(rows[0].vendor).toBe('CPFL');
    const payload = payableImportRowToPayload(rows[0]);
    expect(payload.planName).toBe('CPFL');
    expect(payload.is_recurrence_template).toBe(true);
  });

  it('builds stable match keys for dedupe', () => {
    const key = payablesImportMatchKey({
      vendor: 'CPFL',
      due_date: '2026-06-10',
      amount: 450,
    });
    expect(key).toBe('cpfl|2026-06-10|450.00');
    expect(
      payablesImportMatchKey({ vendor: '  cpfl  ', due_date: '2026-06-10', amount: 450.005 })
    ).toBe('cpfl|2026-06-10|450.01');
  });

  it('marks duplicate rows in file and against existing payables', () => {
    const base = {
      rowIndex: 1,
      vendor: 'CPFL',
      category: 'Luz / energia',
      amount: 450,
      due_date: '2026-06-10',
      recurring: true,
      recurrence_day: 10,
      errors: [],
      valid: true,
    };
    const dupInFile = { ...base, rowIndex: 2 };
    const existingKeys = collectPayablesImportExistingKeys([
      { vendor_label: 'Sabesp', due_date: '2026-06-12', amount: 120 },
    ]);
    const marked = markPayablesImportDuplicates(
      [
        base,
        dupInFile,
        {
          ...base,
          rowIndex: 3,
          vendor: 'Sabesp',
          amount: 120,
          due_date: '2026-06-12',
        },
      ],
      existingKeys
    );
    expect(marked[0].valid).toBe(true);
    expect(marked[1].valid).toBe(false);
    expect(marked[1].errors).toContain('Duplicada no arquivo');
    expect(marked[2].valid).toBe(false);
    expect(marked[2].errors).toContain('Já cadastrada no sistema');
  });
});
