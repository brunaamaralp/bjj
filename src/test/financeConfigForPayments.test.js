import { describe, expect, it } from 'vitest';
import { pickFinanceConfigForPayments } from '../lib/financeConfigForPayments.js';

describe('financeConfigForPayments', () => {
  it('prefere config com contas bancárias configuradas', () => {
    const empty = { plans: [{ name: 'Mensal', price: 100 }], bankAccounts: [] };
    const withBanks = {
      plans: [],
      bankAccounts: [{ bankName: 'Sicoob', account: '1' }],
    };
    expect(pickFinanceConfigForPayments(empty, withBanks)).toBe(withBanks);
    expect(pickFinanceConfigForPayments(withBanks, empty)).toBe(withBanks);
  });
});
