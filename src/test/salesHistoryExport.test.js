import { describe, it, expect, vi } from 'vitest';
import {
  buildSalesHistoryCsvRows,
  fetchAllSalesForPeriod,
  filterSalesForHistoryExport,
  historyExportFilename,
  historyFilterSummary,
  saleHistoryToCsvRow,
} from '../lib/salesHistoryExport.js';

describe('salesHistoryExport', () => {
  const sales = [
    {
      id: 'abc12345',
      status: 'concluida',
      total: 100,
      paid_amount: 100,
      client_name: 'Ana',
      canal: 'presencial',
      canal_label: 'Presencial',
      created_at: '2026-08-10T14:30:00.000Z',
      items_summary: 'Kimono',
      payment_label: 'PIX',
    },
    {
      id: 'xyz99999',
      status: 'cancelada',
      total: 50,
      client_name: 'Bob',
      canal: 'whatsapp_retirada',
      canal_label: 'WhatsApp — retirada',
      created_at: '2026-08-11T10:00:00.000Z',
      items_summary: 'Faixa',
      payment_label: '—',
    },
  ];

  it('historyExportFilename', () => {
    expect(historyExportFilename('2026-08-01', '2026-08-31', 'csv')).toBe(
      'historico-vendas-2026-08-01_2026-08-31.csv'
    );
    expect(historyExportFilename('2026-08-01', '2026-08-31', 'pdf')).toBe(
      'historico-vendas-2026-08-01_2026-08-31.pdf'
    );
  });

  it('historyFilterSummary', () => {
    expect(historyFilterSummary({})).toBe('Sem filtros extras');
    expect(historyFilterSummary({ status: 'concluida', canal: 'presencial', search: 'ana' })).toContain(
      'Concluídas'
    );
    expect(historyFilterSummary({ status: 'concluida', canal: 'presencial', search: 'ana' })).toContain(
      'Presencial'
    );
    expect(historyFilterSummary({ status: 'concluida', canal: 'presencial', search: 'ana' })).toContain(
      'ana'
    );
  });

  it('saleHistoryToCsvRow', () => {
    const row = saleHistoryToCsvRow(sales[0]);
    expect(row.id_curto).toBe('#2345');
    expect(row.cliente).toBe('Ana');
    expect(row.status).toBe('Concluída');
  });

  it('buildSalesHistoryCsvRows inclui resumo e vendas', () => {
    const rows = buildSalesHistoryCsvRows(sales, {
      from: '2026-08-01',
      to: '2026-08-31',
      status: 'all',
      canal: 'all',
      search: '',
    });
    expect(rows.some((r) => r.tipo === 'resumo' && r.metrica === 'Linhas exportadas' && r.valor === 2)).toBe(
      true
    );
    expect(rows.filter((r) => r.tipo === 'venda')).toHaveLength(2);
  });

  it('filterSalesForHistoryExport', () => {
    expect(filterSalesForHistoryExport(sales, { status: 'concluida' })).toHaveLength(1);
    expect(filterSalesForHistoryExport(sales, { search: 'bob' })).toHaveLength(1);
  });

  it('fetchAllSalesForPeriod pagina até o fim', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        sales: [{ id: '1' }],
        has_more: true,
        next_cursor: 'c1',
      })
      .mockResolvedValueOnce({
        sales: [{ id: '2' }],
        has_more: false,
        next_cursor: null,
      });

    const { sales: all, truncated } = await fetchAllSalesForPeriod(fetchPage, {
      from: '2026-08-01',
      to: '2026-08-31',
      pageLimit: 1,
      maxPages: 5,
    });
    expect(all.map((s) => s.id)).toEqual(['1', '2']);
    expect(truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('fetchAllSalesForPeriod marca truncated no cap', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      sales: [{ id: 'x' }],
      has_more: true,
      next_cursor: 'more',
    });
    const { truncated, sales: all } = await fetchAllSalesForPeriod(fetchPage, {
      from: '2026-08-01',
      to: '2026-08-31',
      pageLimit: 1,
      maxPages: 2,
    });
    expect(truncated).toBe(true);
    expect(all).toHaveLength(2);
  });
});
