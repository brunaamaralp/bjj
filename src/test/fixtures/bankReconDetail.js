export const mockStatementList = {
  statements: [
    {
      id: 'st-1',
      filename: 'extrato.csv',
      source_format: 'csv',
      parse_method: 'deterministic',
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      import_date: '2026-02-01',
      total_credit: 100,
      total_debit: 10,
      status: 'pending',
    },
  ],
};

export function buildBankReconDetail(overrides = {}) {
  const items = overrides.items ?? [
    {
      id: 'item-1',
      date: '2026-01-15',
      description: 'PIX Cliente',
      amount: 100,
      direction: 'credit',
      status: 'unmatched',
      match_score: 0,
    },
    {
      id: 'item-2',
      date: '2026-01-16',
      description: 'Taxa banco',
      amount: 10,
      direction: 'debit',
      status: 'unmatched',
      suggested_tx_id: 'tx-2',
      match_score: 72,
    },
    {
      id: 'item-3',
      date: '2026-01-10',
      description: 'PIX antigo',
      amount: 200,
      direction: 'credit',
      status: 'matched',
      matched_tx_id: 'tx-old',
      match_score: 100,
    },
  ];

  const naviUnmatched = overrides.navi_unmatched ?? [
    {
      id: 'tx-1',
      gross: 100,
      settledAt: '2026-01-15',
      planName: 'Mensalidade João',
      direction: 'in',
      reconciled: false,
    },
    {
      id: 'tx-2',
      gross: 10,
      settledAt: '2026-01-16',
      category: 'Taxa banco',
      direction: 'out',
      reconciled: false,
    },
    {
      id: 'tx-far',
      gross: 100,
      settledAt: '2026-02-20',
      planName: 'Fora do filtro',
      direction: 'in',
      reconciled: false,
    },
  ];

  const pendingItems = items.filter((i) => i.status !== 'matched' && i.status !== 'ignored');

  return {
    statement: {
      id: 'st-1',
      filename: 'extrato.csv',
      status: 'pending',
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      source_format: 'csv',
      total_credit: 100,
      total_debit: 10,
      ...overrides.statement,
    },
    items,
    navi_transactions: naviUnmatched,
    navi_unmatched: naviUnmatched,
    summary: {
      reconciled_count: items.filter((i) => i.status === 'matched').length,
      reconciled_amount: 200,
      pending_count: pendingItems.length,
      pending_amount: pendingItems.reduce((s, i) => s + i.amount, 0),
      balance_gap: 0,
      navi_orphan_count: naviUnmatched.length,
      balance_proof: {
        statement_net: 90,
        reconciled_net: 200,
        pending_statement: 110,
        orphan_navi_net: 210,
        balance_gap: 0,
      },
      ...overrides.summary,
    },
  };
}
