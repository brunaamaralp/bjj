import { describe, it, expect } from 'vitest';
import { deriveClosingTxResultFromPeriodItems } from '../../lib/server/financeClosingData.js';
import { bankBalancesFetchFromYmd } from '../../lib/server/financeBankBalancesData.js';
import {
  trimReceivablesForOverview,
  trimForecastForOverview,
} from '../lib/financeiroOverview.js';
import { FINANCE_REGIME } from '../lib/financeCompetence.js';

describe('deriveClosingTxResultFromPeriodItems', () => {
  it('reuses period TX for closing without extra fields', () => {
    const periodItems = [
      {
        id: 'tx1',
        status: 'settled',
        settledAt: '2026-06-15T10:00:00.000Z',
        createdAt: '2026-06-15T10:00:00.000Z',
      },
      {
        id: 'tx2',
        status: 'pending',
        createdAt: '2026-06-20T10:00:00.000Z',
      },
      {
        id: 'tx3',
        status: 'cancelled',
        settledAt: '2026-06-10T10:00:00.000Z',
      },
    ];
    const result = deriveClosingTxResultFromPeriodItems(
      periodItems,
      '2026-06',
      FINANCE_REGIME.CASH
    );
    expect(result.transactions.map((t) => t.id).sort()).toEqual(['tx1', 'tx2']);
    expect(result.pendingInMonth).toBe(1);
  });
});

describe('bankBalancesFetchFromYmd', () => {
  it('returns earliest date only when all accounts have openingBalanceDate', () => {
    expect(
      bankBalancesFetchFromYmd({
        bankAccounts: [
          { bankName: 'Banco A', account: '1', openingBalanceDate: '2025-06-01' },
          { bankName: 'Banco B', account: '2', openingBalanceDate: '2024-12-15' },
        ],
      })
    ).toBe('2024-12-15');
    expect(
      bankBalancesFetchFromYmd({
        bankAccounts: [
          { bankName: 'Banco A', account: '1' },
          { bankName: 'Banco B', account: '2', openingBalanceDate: '2024-01-01' },
        ],
      })
    ).toBeNull();
  });
});

describe('overview payload trim helpers', () => {
  it('trimReceivablesForOverview keeps summary and top items by due date', () => {
    const trimmed = trimReceivablesForOverview({
      referenceMonth: '2026-06',
      summary: { total: 300 },
      items: [
        { id: 'b', due_date: '2026-06-20', amount: 100 },
        { id: 'a', due_date: '2026-06-05', amount: 200 },
        { id: 'c', due_date: '2026-06-25', amount: 50 },
      ],
    });
    expect(trimmed.summary.total).toBe(300);
    expect(trimmed.totalItems).toBe(3);
    expect(trimmed.topItems.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('trimForecastForOverview returns inflow total and top inflow items', () => {
    const trimmed = trimForecastForOverview({
      weeks: [
        {
          items: [
            { due_date: '2026-06-10', amount: 50, flow: 'in' },
            { due_date: '2026-06-11', amount: 30, flow: 'out' },
            { due_date: '2026-06-12', amount: 80, flow: 'in' },
          ],
        },
      ],
    });
    expect(trimmed.inflowTotal).toBe(130);
    expect(trimmed.topItems).toHaveLength(2);
    expect(trimmed.topItems.every((it) => it.flow !== 'out')).toBe(true);
  });
});
