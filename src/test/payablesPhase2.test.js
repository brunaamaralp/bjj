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
});
