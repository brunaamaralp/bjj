import { describe, it, expect } from 'vitest';
import {
  computeHistoryTotals,
  filterSalesList,
  formatCancelMotivo,
  formatSaleIdShort,
  buildCancelReceiptText,
} from '../lib/salesHistory.js';

describe('salesHistory', () => {
  const sales = [
    { id: 'abc12345', status: 'concluida', total: 100, client_name: 'Ana', canal: 'presencial' },
    { id: 'xyz99999', status: 'cancelada', total: 50, client_name: 'Bob', canal: 'whatsapp_retirada' },
  ];

  it('formatSaleIdShort', () => {
    expect(formatSaleIdShort('abc12345')).toBe('#2345');
  });

  it('filterSalesList by status and search', () => {
    const onlyDone = filterSalesList(sales, { status: 'concluida', canal: 'all', search: '' });
    expect(onlyDone).toHaveLength(1);
    const byName = filterSalesList(sales, { status: 'all', canal: 'all', search: 'bob' });
    expect(byName).toHaveLength(1);
    const byId = filterSalesList(sales, { status: 'all', canal: 'all', search: '#9999' });
    expect(byId).toHaveLength(1);
  });

  it('computeHistoryTotals', () => {
    const t = computeHistoryTotals(sales);
    expect(t.concludedCount).toBe(1);
    expect(t.concludedTotal).toBe(100);
    expect(t.cancelCount).toBe(1);
  });

  it('formatCancelMotivo outro requires text', () => {
    expect(formatCancelMotivo('erro', '')).toBe('Erro na venda');
    expect(formatCancelMotivo('outro', 'Troca')).toBe('Troca');
  });

  it('buildCancelReceiptText', () => {
    const text = buildCancelReceiptText({
      academyName: 'Academia',
      saleId: 'sale1234',
      cancelDate: '01/05/2026',
      cancelReason: 'Erro',
      items: [{ quantidade: 1, display_label: 'Kimono' }],
      refundTotal: 80,
    });
    expect(text).toContain('Academia');
    expect(text).toContain('Kimono');
    expect(text).toContain('80');
  });
});
