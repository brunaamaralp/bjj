/**
 * Saldos liquidados em modo período — invariantes e casos de borda (comportamento correto).
 */
import { describe, it, expect } from 'vitest';
import { computeBankAccountBalances, txSettledYmd } from '../lib/bankAccountBalances.js';
import { computeBankBalancesPayloadFromSettledDocs } from '../../lib/server/financeBankBalancesData.js';

const ACCOUNTS_ZERO_OPENING = [
  { bankName: 'Sicoob', account: '1', openingBalance: 0, openingBalanceDate: '' },
  { bankName: 'Banco do Brasil', account: '99', openingBalance: 0, openingBalanceDate: '' },
  { bankName: 'PagBank', account: 'pj', openingBalance: 0, openingBalanceDate: '' },
];

function assertPeriodInvariant(row) {
  const lhs = round2(row.openingBalance + row.periodInflow - row.periodOutflow);
  expect(row.balance).toBeCloseTo(lhs, 2);
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

describe('modo período — invariante central', () => {
  it('Sicoob: histórico vira saldo inicial; período sem movimento', () => {
    const result = computeBankAccountBalances({
      accounts: ACCOUNTS_ZERO_OPENING,
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-06-15T12:00:00.000Z',
          type: 'plan',
          gross: 2070.74,
          net: 2070.74,
          bank_account: 'Sicoob · 1',
        },
      ],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    const sicoob = result.accounts.find((a) => a.label === 'Sicoob · 1');
    expect(sicoob.openingBalance).toBe(2070.74);
    expect(sicoob.periodInflow).toBe(0);
    expect(sicoob.periodOutflow).toBe(0);
    expect(sicoob.balance).toBe(2070.74);
    assertPeriodInvariant(sicoob);
  });

  it('BB: saldo inicial histórico + entradas do período', () => {
    const result = computeBankAccountBalances({
      accounts: ACCOUNTS_ZERO_OPENING,
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-05-10T12:00:00.000Z',
          type: 'plan',
          gross: 1240.16,
          net: 1240.16,
          bank_account: 'Banco do Brasil · 99',
        },
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'plan',
          gross: 698,
          net: 698,
          bank_account: 'Banco do Brasil · 99',
        },
      ],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    const bb = result.accounts.find((a) => a.label === 'Banco do Brasil · 99');
    expect(bb.openingBalance).toBe(1240.16);
    expect(bb.periodInflow).toBe(698);
    expect(bb.periodOutflow).toBe(0);
    expect(bb.balance).toBe(1938.16);
    assertPeriodInvariant(bb);
  });

  it('cada conta registrada respeita balance === openingBalance + periodInflow − periodOutflow', () => {
    const result = computeBankAccountBalances({
      accounts: ACCOUNTS_ZERO_OPENING,
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-06-01T12:00:00.000Z',
          type: 'plan',
          gross: 100,
          net: 100,
          bank_account: 'Sicoob · 1',
        },
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'expense',
          gross: 40,
          net: -40,
          bank_account: 'Sicoob · 1',
        },
        {
          status: 'settled',
          settledAt: '2026-07-02T12:00:00.000Z',
          type: 'plan',
          gross: 50,
          net: 50,
          bank_account: 'PagBank · pj',
        },
      ],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    for (const row of result.accounts) {
      assertPeriodInvariant(row);
    }
    assertPeriodInvariant({
      openingBalance: result.unallocated.openingBalance,
      periodInflow: result.unallocated.periodInflow,
      periodOutflow: result.unallocated.periodOutflow,
      balance: result.unallocated.balance,
    });
  });
});

describe('openingPeriodBalance com seed de cadastro', () => {
  it('inclui seed quando openingBalanceApplies no dia anterior ao período', () => {
    const result = computeBankAccountBalances({
      accounts: [
        {
          bankName: 'Sicoob',
          account: '1',
          openingBalance: 1000,
          openingBalanceDate: '2026-01-01',
        },
      ],
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-06-30T12:00:00.000Z',
          type: 'plan',
          gross: 500,
          net: 500,
          bank_account: 'Sicoob · 1',
        },
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'plan',
          gross: 100,
          net: 100,
          bank_account: 'Sicoob · 1',
        },
      ],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    const sicoob = result.accounts[0];
    expect(sicoob.openingBalance).toBe(1500);
    expect(sicoob.periodInflow).toBe(100);
    expect(sicoob.balance).toBe(1600);
    assertPeriodInvariant(sicoob);
  });

  it('período iniciando no openingBalanceDate: seed só entra a partir desse dia', () => {
    const result = computeBankAccountBalances({
      accounts: [
        {
          bankName: 'Sicoob',
          account: '1',
          openingBalance: 1000,
          openingBalanceDate: '2026-07-01',
        },
      ],
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'plan',
          gross: 200,
          net: 200,
          bank_account: 'Sicoob · 1',
        },
      ],
      asOfYmd: '2026-07-01',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-01',
    });

    const sicoob = result.accounts[0];
    expect(sicoob.openingBalance).toBe(0);
    expect(sicoob.periodInflow).toBe(200);
    expect(sicoob.balance).toBe(200);
    assertPeriodInvariant(sicoob);
  });
});

describe('base monetária unificada (net)', () => {
  it('entrada e saída usam |net|; taxa implícita não altera inflow sem card_fee', () => {
    const result = computeBankAccountBalances({
      accounts: [{ bankName: 'Sicoob', account: '1', openingBalance: 0, openingBalanceDate: '' }],
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'plan',
          gross: 100,
          net: 97,
          bank_account: 'Sicoob · 1',
        },
        {
          status: 'settled',
          settledAt: '2026-07-01T13:00:00.000Z',
          type: 'expense',
          gross: 50,
          net: -50,
          bank_account: 'Sicoob · 1',
        },
      ],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    const row = result.accounts[0];
    expect(row.periodInflow).toBe(97);
    expect(row.periodOutflow).toBe(50);
    expect(row.balance).toBe(47);
    assertPeriodInvariant(row);
  });

  it('card_fee explícito reduz saldo via saída no período', () => {
    const result = computeBankAccountBalances({
      accounts: [{ bankName: 'Sicoob', account: '1', openingBalance: 0, openingBalanceDate: '' }],
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'plan',
          gross: 100,
          net: 100,
          bank_account: 'Sicoob · 1',
        },
        {
          status: 'settled',
          settledAt: '2026-07-01T12:05:00.000Z',
          type: 'card_fee',
          gross: 3,
          net: -3,
          bank_account: 'Sicoob · 1',
        },
      ],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    const row = result.accounts[0];
    expect(row.periodInflow).toBe(100);
    expect(row.periodOutflow).toBe(3);
    expect(row.balance).toBe(97);
    assertPeriodInvariant(row);
  });
});

describe('fallback de data unificado ($updatedAt → $createdAt)', () => {
  it('txSettledYmd prioriza updated_at antes de createdAt', () => {
    expect(
      txSettledYmd({
        settledAt: '',
        updated_at: '2026-07-01T15:00:00.000Z',
        createdAt: '2026-06-01T10:00:00.000Z',
      })
    ).toBe('2026-07-01');
  });

  it('servidor e cliente classificam TX sem settledAt no mesmo bucket de período', () => {
    const rawDocs = [
      {
        status: 'settled',
        settledAt: null,
        $updatedAt: '2026-07-01T15:00:00.000Z',
        $createdAt: '2026-06-01T10:00:00.000Z',
        type: 'plan',
        gross: 200,
        net: 200,
        bank_account: 'Sicoob · 1',
      },
    ];

    const payload = computeBankBalancesPayloadFromSettledDocs(
      rawDocs,
      '2026-07-02',
      {
        bankAccounts: [{ bankName: 'Sicoob', account: '1', openingBalance: 0, openingBalanceDate: '' }],
      },
      { periodFrom: '2026-07-01', periodTo: '2026-07-02' }
    );

    const row = payload.accounts.find((a) => a.label === 'Sicoob · 1');
    expect(row.periodInflow).toBe(200);
    expect(row.periodOutflow).toBe(0);
    expect(row.openingBalance).toBe(0);
    expect(row.balance).toBe(200);
    assertPeriodInvariant(row);
  });
});

describe('não alocado em modo período', () => {
  it('histórico negativo vira saldo inicial; período zerado', () => {
    const result = computeBankAccountBalances({
      accounts: ACCOUNTS_ZERO_OPENING,
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-03-01T12:00:00.000Z',
          type: 'expense',
          gross: 102384.86,
          net: -102384.86,
          bank_account: 'PagBank · pj',
        },
      ],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    const pagbank = result.accounts.find((a) => a.label === 'PagBank · pj');
    expect(pagbank.openingBalance).toBe(-102384.86);
    expect(pagbank.periodInflow).toBe(0);
    expect(pagbank.periodOutflow).toBe(0);
    expect(pagbank.balance).toBe(-102384.86);
    assertPeriodInvariant(pagbank);
  });

  it('não alocado expõe openingBalance e fluxo do período', () => {
    const result = computeBankAccountBalances({
      accounts: ACCOUNTS_ZERO_OPENING,
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-06-01T12:00:00.000Z',
          type: 'plan',
          gross: 300,
          net: 300,
          bank_account: '',
        },
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'plan',
          gross: 50,
          net: 50,
          bank_account: '',
        },
      ],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    expect(result.unallocated.openingBalance).toBe(300);
    expect(result.unallocated.periodInflow).toBe(50);
    expect(result.unallocated.periodOutflow).toBe(0);
    expect(result.unallocated.balance).toBe(350);
    assertPeriodInvariant({
      openingBalance: result.unallocated.openingBalance,
      periodInflow: result.unallocated.periodInflow,
      periodOutflow: result.unallocated.periodOutflow,
      balance: result.unallocated.balance,
    });
  });
});

describe('casos de borda', () => {
  it('período de um único dia', () => {
    const result = computeBankAccountBalances({
      accounts: [{ bankName: 'Sicoob', account: '1', openingBalance: 0, openingBalanceDate: '' }],
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-07-01T09:00:00.000Z',
          type: 'plan',
          gross: 10,
          net: 10,
          bank_account: 'Sicoob · 1',
        },
      ],
      asOfYmd: '2026-07-01',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-01',
    });

    const row = result.accounts[0];
    expect(row.periodInflow).toBe(10);
    expect(row.balance).toBe(10);
    assertPeriodInvariant(row);
  });

  it('conta sem nenhuma TX mantém seed como saldo', () => {
    const result = computeBankAccountBalances({
      accounts: [
        { bankName: 'Sicoob', account: '1', openingBalance: 500, openingBalanceDate: '2026-01-01' },
      ],
      transactions: [],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    const row = result.accounts[0];
    expect(row.openingBalance).toBe(500);
    expect(row.periodInflow).toBe(0);
    expect(row.periodOutflow).toBe(0);
    expect(row.balance).toBe(500);
    assertPeriodInvariant(row);
  });

  it('TX em periodFrom e periodTo entram no período (inclusivo)', () => {
    const result = computeBankAccountBalances({
      accounts: [{ bankName: 'Sicoob', account: '1', openingBalance: 0, openingBalanceDate: '' }],
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-07-01T00:00:00.000Z',
          type: 'plan',
          gross: 10,
          net: 10,
          bank_account: 'Sicoob · 1',
        },
        {
          status: 'settled',
          settledAt: '2026-07-02T23:59:00.000Z',
          type: 'plan',
          gross: 20,
          net: 20,
          bank_account: 'Sicoob · 1',
        },
        {
          status: 'settled',
          settledAt: '2026-06-30T12:00:00.000Z',
          type: 'plan',
          gross: 5,
          net: 5,
          bank_account: 'Sicoob · 1',
        },
      ],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    const row = result.accounts[0];
    expect(row.openingBalance).toBe(5);
    expect(row.periodInflow).toBe(30);
    expect(row.balance).toBe(35);
    assertPeriodInvariant(row);
  });
});

describe('CMV automático (competência) fora dos saldos', () => {
  it('sale_cmv não entra em não alocado nem no total', () => {
    const result = computeBankAccountBalances({
      accounts: ACCOUNTS_ZERO_OPENING,
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'stock_purchase',
          gross: 120,
          net: -120,
          origin_type: 'sale_cmv',
          ledger_regime: 'accrual',
          method: 'interno',
          bank_account: '',
        },
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'plan',
          gross: 500,
          net: 500,
          bank_account: '',
        },
      ],
      asOfYmd: '2026-07-02',
      periodFrom: '2026-07-01',
      periodTo: '2026-07-02',
    });

    expect(result.unallocated.count).toBe(1);
    expect(result.unallocated.balance).toBe(500);
    expect(result.unallocated.periodOutflow).toBe(0);
    expect(result.totalBalance).toBe(500);
  });

  it('CMV legado sem origin_type também é ignorado', () => {
    const result = computeBankAccountBalances({
      accounts: ACCOUNTS_ZERO_OPENING,
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'stock_purchase',
          method: 'interno',
          planName: 'CMV — Rashguard',
          gross: 45,
          net: -45,
          bank_account: '',
        },
      ],
      asOfYmd: '2026-07-02',
    });

    expect(result.unallocated.count).toBe(0);
    expect(result.unallocated.balance).toBe(0);
    expect(result.totalBalance).toBe(0);
  });

  it('compra de estoque com caixa real continua em não alocado', () => {
    const result = computeBankAccountBalances({
      accounts: ACCOUNTS_ZERO_OPENING,
      transactions: [
        {
          status: 'settled',
          settledAt: '2026-07-01T12:00:00.000Z',
          type: 'stock_purchase',
          method: 'pix',
          origin_type: 'stock_entry',
          gross: 200,
          net: -200,
          bank_account: '',
        },
      ],
      asOfYmd: '2026-07-02',
    });

    expect(result.unallocated.count).toBe(1);
    expect(result.unallocated.balance).toBe(-200);
  });
});
