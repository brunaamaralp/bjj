import { describe, it, expect } from 'vitest';
import {
  computeHistoryTotals,
  estimateCancelRefund,
  filterSalesList,
  formatCancelMotivo,
  formatSaleIdShort,
  buildCancelReceiptText,
  itemsSummaryFromSnapshot,
  saleAllowsCancelOrEdit,
  saleAllowsStockRepair,
  saleIsDraft,
  saleAllowsDiscardDraft,
  saleIsPartiallyPaid,
} from '../lib/salesHistory.js';

describe('salesHistory', () => {
  const sales = [
    { id: 'abc12345', status: 'concluida', total: 100, paid_amount: 100, client_name: 'Ana', canal: 'presencial' },
    { id: 'xyz99999', status: 'cancelada', total: 50, client_name: 'Bob', canal: 'whatsapp_retirada' },
    { id: 'pend0001', status: 'pendente', total: 200, paid_amount: 0, remaining_amount: 200, client_name: 'Carla', canal: 'presencial' },
    { id: 'parc0002', status: 'parcial', total: 150, paid_amount: 50, remaining_amount: 100, client_name: 'Dan', canal: 'presencial', items_summary: 'Kimono M', payment_label: 'PIX parcial' },
    { id: 'draft001', status: 'rascunho', total: 80, client_name: 'Eva', canal: 'presencial', items_summary: 'Faixa' },
  ];

  it('formatSaleIdShort', () => {
    expect(formatSaleIdShort('abc12345')).toBe('#2345');
  });

  it('saleAllowsCancelOrEdit', () => {
    expect(saleAllowsCancelOrEdit('concluida')).toBe(true);
    expect(saleAllowsCancelOrEdit('pendente')).toBe(true);
    expect(saleAllowsCancelOrEdit('parcial')).toBe(true);
    expect(saleAllowsCancelOrEdit('cancelling')).toBe(true);
    expect(saleAllowsCancelOrEdit({ status: '', deferred: true })).toBe(true);
    expect(saleAllowsCancelOrEdit('cancelada')).toBe(false);
    expect(saleAllowsCancelOrEdit('rascunho')).toBe(false);
  });

  it('saleAllowsStockRepair', () => {
    expect(saleAllowsStockRepair('cancelada')).toBe(true);
    expect(saleAllowsStockRepair('concluida')).toBe(false);
    expect(saleAllowsStockRepair('cancelling')).toBe(false);
  });

  it('filterSalesList by status and search', () => {
    const onlyDone = filterSalesList(sales, { status: 'concluida', canal: 'all', search: '' });
    expect(onlyDone).toHaveLength(1);
    const byName = filterSalesList(sales, { status: 'all', canal: 'all', search: 'bob' });
    expect(byName).toHaveLength(1);
    const byId = filterSalesList(sales, { status: 'all', canal: 'all', search: '#9999' });
    expect(byId).toHaveLength(1);
    const open = filterSalesList(sales, { status: 'em_aberto', canal: 'all', search: '' });
    expect(open).toHaveLength(2);
    const partial = filterSalesList(sales, { status: 'parcial', canal: 'all', search: '' });
    expect(partial).toHaveLength(1);
    const pending = filterSalesList(sales, { status: 'pendente', canal: 'all', search: '' });
    expect(pending).toHaveLength(1);
    const drafts = filterSalesList(sales, { status: 'rascunho', canal: 'all', search: '' });
    expect(drafts).toHaveLength(1);
    const byProduct = filterSalesList(sales, { status: 'all', canal: 'all', search: 'kimono' });
    expect(byProduct).toHaveLength(1);
    const byPayment = filterSalesList(sales, { status: 'all', canal: 'all', search: 'pix' });
    expect(byPayment).toHaveLength(1);
  });

  it('saleIsDraft and saleAllowsDiscardDraft', () => {
    expect(saleIsDraft('rascunho')).toBe(true);
    expect(saleAllowsDiscardDraft(sales[4])).toBe(true);
    expect(saleAllowsDiscardDraft('concluida')).toBe(false);
  });

  it('computeHistoryTotals', () => {
    const t = computeHistoryTotals(sales);
    expect(t.concludedCount).toBe(1);
    expect(t.concludedReceived).toBe(100);
    expect(t.openCount).toBe(2);
    expect(t.openRemaining).toBe(300);
    expect(t.cancelCount).toBe(1);
  });

  it('estimateCancelRefund and saleIsPartiallyPaid', () => {
    expect(estimateCancelRefund(sales[3])).toBe(50);
    expect(saleIsPartiallyPaid(sales[3])).toBe(true);
    expect(saleIsPartiallyPaid(sales[2])).toBe(false);
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

  it('itemsSummaryFromSnapshot uses stored labels', () => {
    const doc = {
      itens_snapshot_json: JSON.stringify([
        { label: 'Kimono M', quantidade: 1 },
        { label: 'Faixa', quantidade: 1 },
      ]),
    };
    expect(itemsSummaryFromSnapshot(doc)).toBe('Kimono M + 1 outro');
    expect(itemsSummaryFromSnapshot({ itens_snapshot_json: '[]' })).toBeNull();
    expect(itemsSummaryFromSnapshot({})).toBeNull();
  });
});
