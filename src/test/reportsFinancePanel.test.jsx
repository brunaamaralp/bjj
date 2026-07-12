import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ReportsFinancePanel from '../components/reports/ReportsFinancePanel.jsx';

const { fetchReportsFinanceLightResult, fetchReceivables, listFinanceTx } = vi.hoisted(() => ({
  fetchReportsFinanceLightResult: vi.fn(),
  fetchReceivables: vi.fn(),
  listFinanceTx: vi.fn(),
}));

vi.mock('../lib/reportsLightApi.js', () => ({
  fetchReportsFinanceLightResult,
}));

vi.mock('../lib/financeTxApi.js', () => ({
  fetchReceivables,
  listFinanceTx,
}));

describe('ReportsFinancePanel', () => {
  beforeEach(() => {
    fetchReportsFinanceLightResult.mockReset();
    fetchReceivables.mockReset();
    listFinanceTx.mockReset();
    fetchReceivables.mockResolvedValue({ summary: { total: 500 } });
    listFinanceTx.mockResolvedValue({ transactions: [] });
  });

  it('exibe banner de resumo básico para scope basic', async () => {
    fetchReportsFinanceLightResult.mockResolvedValue({
      ok: true,
      data: {
        scope: 'basic',
        limited: true,
        received: 1000,
        expenses: 400,
        balance: 600,
        receivedCount: 3,
        expenseCount: 2,
      },
    });

    render(
      <MemoryRouter>
        <ReportsFinancePanel
          academyId="acad-1"
          from="2026-07-01"
          to="2026-07-12"
          preset="month"
          hasFinance
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Resumo básico/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Recebimentos por forma de pagamento')).not.toBeInTheDocument();
  });

  it('destaca saldo negativo e mostra breakdown com percentual', async () => {
    fetchReportsFinanceLightResult.mockResolvedValue({
      ok: true,
      data: {
        scope: 'full',
        received: 100,
        expenses: 250,
        balance: -150,
        receivedCount: 1,
        expenseCount: 2,
        byMethod: [{ method: 'pix', total: 100 }],
      },
    });

    const { container } = render(
      <MemoryRouter>
        <ReportsFinancePanel
          academyId="acad-1"
          from="2026-07-01"
          to="2026-07-12"
          preset="month"
          hasFinance
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Recebimentos por forma de pagamento')).toBeInTheDocument();
    });

    expect(container.querySelector('.report-kpi-card--danger')).toBeTruthy();
    expect(screen.getByText(/PIX · 100%/i)).toBeInTheDocument();
  });

  it('rotula a receber com o mês da data final', async () => {
    fetchReportsFinanceLightResult.mockResolvedValue({
      ok: true,
      data: {
        scope: 'full',
        received: 50,
        expenses: 0,
        balance: 50,
        receivedCount: 1,
        expenseCount: 0,
        byMethod: [],
      },
    });

    render(
      <MemoryRouter>
        <ReportsFinancePanel
          academyId="acad-1"
          from="2026-07-01"
          to="2026-07-12"
          preset="month"
          hasFinance
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/A receber \(jul/i)).toBeInTheDocument();
    });
  });

  it('empty state oferece CTA para Lançamentos', async () => {
    fetchReportsFinanceLightResult.mockResolvedValue({
      ok: true,
      data: {
        scope: 'full',
        received: 0,
        expenses: 0,
        balance: 0,
        receivedCount: 0,
        expenseCount: 0,
        byMethod: [],
      },
    });

    render(
      <MemoryRouter>
        <ReportsFinancePanel
          academyId="acad-1"
          from="2026-07-01"
          to="2026-07-12"
          preset="month"
          hasFinance
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ir para Lançamentos/i })).toBeInTheDocument();
    });
  });

  it('mostra atalhos financeiros para gestores', async () => {
    fetchReportsFinanceLightResult.mockResolvedValue({
      ok: true,
      data: {
        scope: 'full',
        received: 200,
        expenses: 50,
        balance: 150,
        receivedCount: 2,
        expenseCount: 1,
        byMethod: [{ method: 'pix', total: 200 }],
      },
    });

    render(
      <MemoryRouter>
        <ReportsFinancePanel
          academyId="acad-1"
          from="2026-07-01"
          to="2026-07-12"
          preset="month"
          hasFinance
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: /Atalhos financeiros/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Lançamentos' })).toHaveAttribute(
      'href',
      '/financeiro?tab=movimentacoes&from=2026-07-01&to=2026-07-12'
    );
    expect(screen.getByRole('link', { name: 'DRE e DFC' })).toHaveAttribute(
      'href',
      '/financeiro?tab=dre'
    );
  });

  it('exibe bloco MDR quando há taxas', async () => {
    fetchReportsFinanceLightResult.mockResolvedValue({
      ok: true,
      data: {
        scope: 'full',
        received: 194,
        expenses: 0,
        balance: 194,
        receivedCount: 1,
        expenseCount: 0,
        byMethod: [{ method: 'cartao_credito', total: 194 }],
        revenueBreakdown: { grossIn: 200, fees: 6, netIn: 194, count: 1 },
      },
    });

    render(
      <MemoryRouter>
        <ReportsFinancePanel
          academyId="acad-1"
          from="2026-07-01"
          to="2026-07-12"
          preset="month"
          hasFinance
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Faturamento e taxas')).toBeInTheDocument();
    });
    expect(screen.getByText('Taxas (MDR)')).toBeInTheDocument();
  });

  it('mostra tendência vs período anterior', async () => {
    fetchReportsFinanceLightResult
      .mockResolvedValueOnce({
        ok: true,
        data: {
          scope: 'full',
          received: 200,
          expenses: 50,
          balance: 150,
          receivedCount: 2,
          expenseCount: 1,
          byMethod: [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          scope: 'full',
          received: 100,
          expenses: 50,
          balance: 50,
          receivedCount: 1,
          expenseCount: 1,
          byMethod: [],
        },
      });

    render(
      <MemoryRouter>
        <ReportsFinancePanel
          academyId="acad-1"
          from="2026-07-01"
          to="2026-07-12"
          preset="month"
          hasFinance
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/vs\. período anterior/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText('+100%')).toBeInTheDocument();
  });

  it('abre drill ao clicar em Recebido', async () => {
    const user = userEvent.setup();
    fetchReportsFinanceLightResult.mockResolvedValue({
      ok: true,
      data: {
        scope: 'full',
        received: 200,
        expenses: 0,
        balance: 200,
        receivedCount: 1,
        expenseCount: 0,
        byMethod: [{ method: 'pix', total: 200 }],
      },
    });
    listFinanceTx.mockResolvedValue({
      transactions: [
        {
          id: 'tx1',
          type: 'plan',
          gross: 200,
          net: 200,
          status: 'settled',
          settledAt: '2026-07-05T12:00:00.000Z',
          method: 'pix',
          category: 'Plano mensal',
        },
      ],
    });

    render(
      <MemoryRouter>
        <ReportsFinancePanel
          academyId="acad-1"
          from="2026-07-01"
          to="2026-07-12"
          preset="month"
          hasFinance
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Recebido')).toBeInTheDocument();
    });

    const receivedCard = screen
      .getAllByRole('button', { name: /Recebido/i })
      .find((el) => el.classList.contains('report-kpi-card--clickable'));
    expect(receivedCard).toBeTruthy();
    await user.click(receivedCard);

    await waitFor(() => {
      expect(screen.getByText('Recebimentos no período')).toBeInTheDocument();
    });
    expect(listFinanceTx).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'in', status: 'settled' })
    );
  });

  it('exibe gráfico semanal quando há weeklySeries', async () => {
    fetchReportsFinanceLightResult.mockResolvedValue({
      ok: true,
      data: {
        scope: 'full',
        received: 150,
        expenses: 40,
        balance: 110,
        receivedCount: 2,
        expenseCount: 1,
        byMethod: [{ method: 'pix', total: 150 }],
        weeklySeries: [
          { label: '7–13 abr', weekStart: '2026-04-07', weekEnd: '2026-04-13', received: 100, expenses: 40 },
          { label: '14–20 abr', weekStart: '2026-04-14', weekEnd: '2026-04-20', received: 50, expenses: 0 },
        ],
      },
    });

    render(
      <MemoryRouter>
        <ReportsFinancePanel
          academyId="acad-1"
          from="2026-04-01"
          to="2026-04-30"
          preset="month"
          hasFinance
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Evolução semanal')).toBeInTheDocument();
    });
  });
});
