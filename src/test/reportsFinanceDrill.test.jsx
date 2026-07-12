import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportsFinanceDrillDialog from '../components/reports/ReportsFinanceDrillDialog.jsx';

const { listFinanceTx } = vi.hoisted(() => ({
  listFinanceTx: vi.fn(),
}));

vi.mock('../lib/financeTxApi.js', () => ({
  listFinanceTx,
}));

describe('ReportsFinanceDrillDialog', () => {
  beforeEach(() => {
    listFinanceTx.mockReset();
    listFinanceTx.mockResolvedValue({
      transactions: [
        {
          id: 'tx1',
          type: 'plan',
          gross: 150,
          net: 150,
          status: 'settled',
          settledAt: '2026-07-05T12:00:00.000Z',
          method: 'pix',
          category: 'Mensalidade',
        },
      ],
    });
  });

  it('lista lançamentos e link para Lançamentos', async () => {
    render(
      <MemoryRouter>
        <ReportsFinanceDrillDialog
          drillKey="received"
          academyId="acad-1"
          from="2026-07-01"
          to="2026-07-12"
          regime="cash"
          onClose={() => {}}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Mensalidade')).toBeInTheDocument();
    });

    expect(listFinanceTx).toHaveBeenCalledWith(
      expect.objectContaining({
        academyId: 'acad-1',
        direction: 'in',
        status: 'settled',
        limit: 50,
      })
    );

    expect(screen.getByRole('link', { name: /Abrir em Lançamentos/i })).toHaveAttribute(
      'href',
      '/financeiro?tab=movimentacoes&from=2026-07-01&to=2026-07-12&regime=cash'
    );
  });
});
