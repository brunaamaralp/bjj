import { describe, expect, it } from 'vitest';
import { pickFinanceConfigForPayments } from '../lib/financeConfigForPayments.js';

describe('financeConfigForPayments', () => {
  it('une contas e planos de todos os candidatos', () => {
    const withPlans = { plans: [{ name: 'Mensal', price: 100 }], bankAccounts: [] };
    const withBanks = {
      plans: [],
      bankAccounts: [{ bankName: 'Sicoob', account: '1' }],
    };
    const merged = pickFinanceConfigForPayments(withPlans, withBanks);
    expect(merged.plans).toHaveLength(1);
    expect(merged.bankAccounts).toHaveLength(1);
    expect(merged.bankAccounts[0].bankName).toBe('Sicoob');
  });

  it('preserva contas quando só o segundo candidato tem bancos', () => {
    const empty = { plans: [{ name: 'Novo', price: 50 }], bankAccounts: [] };
    const legacy = {
      plans: [{ name: 'Antigo', price: 80 }],
      bankAccounts: [{ bankName: 'BB', account: '99' }],
    };
    const merged = pickFinanceConfigForPayments(empty, legacy);
    expect(merged.plans.map((p) => p.name).sort()).toEqual(['Antigo', 'Novo']);
    expect(merged.bankAccounts).toHaveLength(1);
  });
});
