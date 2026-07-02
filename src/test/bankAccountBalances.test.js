import { describe, it, expect } from 'vitest';
import {
  computeBankAccountBalances,
  resolveTxBankAccount,
  openingBalanceApplies,
  FINANCE_BANK_NOTE_PREFIX,
} from '../lib/bankAccountBalances.js';

describe('bankAccountBalances', () => {
  const accounts = [
    {
      bankName: 'Sicoob',
      account: '1',
      openingBalance: 1000,
      openingBalanceDate: '2026-01-01',
    },
    {
      bankName: 'Nubank',
      account: '2',
      openingBalance: 500,
      openingBalanceDate: '',
    },
  ];

  it('resolveTxBankAccount from attribute or note', () => {
    expect(resolveTxBankAccount({ bank_account: 'Sicoob · 1' })).toBe('Sicoob · 1');
    expect(
      resolveTxBankAccount({ note: `${FINANCE_BANK_NOTE_PREFIX}Nubank · 2\nObs` })
    ).toBe('Nubank · 2');
    expect(resolveTxBankAccount({})).toBe('');
  });

  it('openingBalanceApplies respects date', () => {
    expect(openingBalanceApplies('2026-06-01', '2026-01-01')).toBe(true);
    expect(openingBalanceApplies('2025-12-01', '2026-01-01')).toBe(false);
    expect(openingBalanceApplies('2026-06-01', '')).toBe(true);
  });

  it('computes per-account balance and unallocated', () => {
    const transactions = [
      {
        status: 'settled',
        settledAt: '2026-06-01T12:00:00.000Z',
        type: 'plan',
        gross: 200,
        net: 190,
        bank_account: 'Sicoob · 1',
      },
      {
        status: 'settled',
        settledAt: '2026-06-02T12:00:00.000Z',
        type: 'expense',
        gross: 50,
        net: -50,
        bank_account: 'Sicoob · 1',
      },
      {
        status: 'settled',
        settledAt: '2026-06-03T12:00:00.000Z',
        type: 'product',
        gross: 100,
        net: 100,
      },
      {
        status: 'pending',
        settledAt: '2026-06-04T12:00:00.000Z',
        type: 'plan',
        gross: 999,
        net: 999,
        bank_account: 'Sicoob · 1',
      },
    ];

    const result = computeBankAccountBalances({
      accounts,
      transactions,
      asOfYmd: '2026-06-30',
    });

    const sicoob = result.accounts.find((a) => a.label === 'Sicoob · 1');
    expect(sicoob.openingBalance).toBe(1000);
    expect(sicoob.inflow).toBe(190);
    expect(sicoob.outflow).toBe(50);
    expect(sicoob.balance).toBe(1140);
    expect(sicoob.movementCount).toBe(2);

    expect(result.unallocated.inflow).toBe(100);
    expect(result.unallocated.count).toBe(1);
    expect(result.totalBalance).toBe(1140 + 500 + 100);
  });

  it('computes periodInflow/outflow only inside interval', () => {
    const transactions = [
      {
        status: 'settled',
        settledAt: '2026-06-01T12:00:00.000Z',
        type: 'plan',
        gross: 200,
        net: 200,
        bank_account: 'Sicoob · 1',
      },
      {
        status: 'settled',
        settledAt: '2026-06-20T12:00:00.000Z',
        type: 'expense',
        gross: 80,
        net: -80,
        bank_account: 'Sicoob · 1',
      },
      {
        status: 'settled',
        settledAt: '2026-07-05T12:00:00.000Z',
        type: 'plan',
        gross: 300,
        net: 300,
        bank_account: 'Sicoob · 1',
      },
    ];

    const result = computeBankAccountBalances({
      accounts,
      transactions,
      asOfYmd: '2026-07-31',
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
    });

    const sicoob = result.accounts.find((a) => a.label === 'Sicoob · 1');
    expect(sicoob.balance).toBe(1420);
    expect(sicoob.inflow).toBe(500);
    expect(sicoob.outflow).toBe(80);
    expect(sicoob.periodInflow).toBe(200);
    expect(sicoob.periodOutflow).toBe(80);
    expect(sicoob.periodMovementCount).toBe(2);
    expect(result.periodFrom).toBe('2026-06-01');
    expect(result.periodTo).toBe('2026-06-30');
  });
});
