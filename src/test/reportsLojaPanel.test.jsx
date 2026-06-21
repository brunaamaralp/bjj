import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportsLojaPanel from '../components/reports/ReportsLojaPanel.jsx';

const { fetchReportsSalesLight, fetchReportsByOperator } = vi.hoisted(() => ({
  fetchReportsSalesLight: vi.fn(),
  fetchReportsByOperator: vi.fn(),
}));

vi.mock('../lib/reportsLightApi.js', () => ({
  fetchReportsSalesLight,
}));

vi.mock('../lib/reportsByOperatorApi.js', () => ({
  fetchReportsByOperator,
}));

describe('ReportsLojaPanel', () => {
  beforeEach(() => {
    fetchReportsSalesLight.mockReset();
    fetchReportsByOperator.mockReset();
  });

  it('nao quebra quando o payload de vendas chega com buckets nao-array', async () => {
    fetchReportsSalesLight.mockResolvedValue({
      concludedCount: 1,
      concludedTotal: 120,
      cancelCount: 0,
      ticketMedio: 120,
      byChannel: {},
      byProduct: {},
      byBuyer: {},
    });

    render(
      <MemoryRouter>
        <ReportsLojaPanel academyId="acad-1" from="2026-06-01" to="2026-06-30" hasSales />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Vendas no período')).toBeInTheDocument();
    });
    expect(screen.getByText('Quem mais compra')).toBeInTheDocument();
  });
});
