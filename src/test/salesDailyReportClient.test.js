import { describe, it, expect } from 'vitest';
import {
  buildDailyReportCsvRows,
  buildDailyReportText,
  dailyReportFilename,
  resolveDailyReportDateYmd,
} from '../lib/salesDailyReport.js';

describe('resolveDailyReportDateYmd', () => {
  it('usa dia único do filtro', () => {
    expect(resolveDailyReportDateYmd({ from: '2026-07-01', to: '2026-07-01' })).toBe('2026-07-01');
  });

  it('usa hoje quando filtro é intervalo', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(resolveDailyReportDateYmd({ from: '2026-07-01', to: '2026-07-05' })).toBe(today);
  });
});

describe('buildDailyReportText', () => {
  it('inclui resumo e vendas concluídas', () => {
    const text = buildDailyReportText({
      academy_name: 'Demo',
      date: '2026-07-01',
      summary: {
        concluded_count: 1,
        concluded_total: 100,
        ticket_medio: 100,
        cancel_count: 0,
        pending_count: 0,
        pending_total: 0,
      },
      totals_by_payment: { pix: 100 },
      sales_concluded: [
        {
          id: 'abc123',
          created_at: '2026-07-01T14:00:00.000Z',
          client_name: 'Maria',
          items_summary: 'Kimono M',
          total: 100,
          payment_label: 'PIX',
        },
      ],
      sales_cancelled: [],
      sales_pending: [],
    });
    expect(text).toContain('FECHAMENTO DO DIA — Demo');
    expect(text).toContain('01/07/2026');
    expect(text).toContain('Vendas concluídas');
    expect(text).toContain('Maria');
    expect(text).toContain('Kimono M');
    expect(text).toContain('PIX');
  });
});

describe('buildDailyReportCsvRows', () => {
  it('inclui linhas resumo e venda', () => {
    const rows = buildDailyReportCsvRows({
      date: '2026-07-01',
      academy_name: 'Demo',
      summary: { concluded_count: 1, concluded_total: 50, ticket_medio: 50, cancel_count: 0 },
      totals_by_payment: {},
      sales_concluded: [
        {
          id: 'x1',
          created_at: '2026-07-01T10:00:00Z',
          client_name: 'João',
          items_summary: 'Faixa',
          total: 50,
          payment_label: 'Dinheiro',
        },
      ],
      sales_cancelled: [],
      sales_pending: [],
    });
    expect(rows.some((r) => r.tipo === 'resumo' && r.metrica === 'Vendas concluídas (qtd)')).toBe(true);
    expect(rows.some((r) => r.tipo === 'venda' && r.cliente === 'João')).toBe(true);
  });
});

describe('dailyReportFilename', () => {
  it('formata nome do arquivo', () => {
    expect(dailyReportFilename('2026-07-01')).toBe('fechamento-dia-2026-07-01.csv');
  });
});
