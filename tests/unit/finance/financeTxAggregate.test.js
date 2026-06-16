import { describe, it, expect } from 'vitest';
import { aggregateOperationalSummary } from '../../../lib/server/financeTxAggregate.js';

describe('financeTxAggregate operational buckets', () => {
  it('exclui aporte de capital da receita operacional', () => {
    const docs = [
      { status: 'settled', type: 'plan', category: 'Mensalidades', gross: 300, net: 300 },
      { status: 'settled', type: 'equity_injection', category: 'Aporte de capital', gross: 50000, net: 50000 },
    ];
    const summary = aggregateOperationalSummary(docs);
    expect(summary.received).toBe(300);
    expect(summary.receivedCount).toBe(1);
  });

  it('exclui pagamento de empréstimo das despesas operacionais', () => {
    const docs = [
      { status: 'settled', type: 'expense_operational', category: 'Outras despesas', gross: 100, net: -100, direction: 'out' },
      { status: 'settled', type: 'loan_repayment', category: 'Pagamento de empréstimo', gross: 2000, net: -2000, direction: 'out' },
    ];
    const summary = aggregateOperationalSummary(docs);
    expect(summary.expenses).toBe(100);
    expect(summary.expenseCount).toBe(1);
  });
});
