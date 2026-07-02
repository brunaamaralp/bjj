import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDeferredSales: vi.fn(),
  listGridPaymentsForAcademy: vi.fn(),
  computeBankBalancesPayload: vi.fn(),
  listContractsAwaitingForecast: vi.fn(),
}));

vi.mock('../../lib/server/financeReceivablesData.js', () => ({
  listDeferredSales: (...args) => mocks.listDeferredSales(...args),
  listGridPaymentsForAcademy: (...args) => mocks.listGridPaymentsForAcademy(...args),
}));

vi.mock('../../lib/server/financeBankBalancesData.js', () => ({
  computeBankBalancesPayload: (...args) => mocks.computeBankBalancesPayload(...args),
  todayYmdLocal: () => '2026-07-01',
}));

vi.mock('../../lib/server/financeForecastContracts.js', () => ({
  listContractsAwaitingForecast: (...args) => mocks.listContractsAwaitingForecast(...args),
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  DB_ID: 'db',
  databases: {
    listDocuments: vi.fn().mockResolvedValue({ documents: [] }),
  },
}));

import { buildFinanceForecast } from '../../lib/server/financeForecastHandler.js';

describe('buildFinanceForecast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listDeferredSales.mockResolvedValue({ rows: [], truncated: false });
    mocks.listGridPaymentsForAcademy.mockResolvedValue({ rows: [], truncated: false });
    mocks.computeBankBalancesPayload.mockResolvedValue({
      ok: true,
      totalBalance: 0,
      accounts: [],
      unallocated: 0,
    });
    mocks.listContractsAwaitingForecast.mockResolvedValue([]);
  });

  it('accepts listDeferredSales { rows } shape without throwing', async () => {
    mocks.listDeferredSales.mockResolvedValue({
      rows: [
        {
          $id: 'sale-1',
          deferred: true,
          status: 'pendente',
          total: 120,
          due_date: '2026-07-15',
          cliente_nome: 'Cliente teste',
        },
      ],
      truncated: false,
    });

    const result = await buildFinanceForecast('ac-1', '2026-07-01', '2026-07-31', {
      financeConfig: { plans: [{ name: 'Mensal', price: 200 }], bankAccounts: [] },
      preloadedStudents: [],
      preloadedOpeningBalance: 0,
    });

    expect(Array.isArray(result.weeks)).toBe(true);
    expect(result.summary).toBeTruthy();
  });
});
