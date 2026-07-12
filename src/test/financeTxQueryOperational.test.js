import { describe, it, expect } from 'vitest';
import { filterOperationalReportTxs } from '../../lib/server/financeTxQuery.js';

describe('filterOperationalReportTxs', () => {
  const txs = [
    {
      id: 'in1',
      type: 'plan',
      gross: 200,
      net: 200,
      status: 'settled',
      method: 'pix',
    },
    {
      id: 'out1',
      type: 'expense',
      gross: 50,
      net: -50,
      direction: 'out',
      status: 'settled',
    },
    {
      id: 'pend',
      type: 'plan',
      gross: 100,
      status: 'pending',
    },
    {
      id: 'ref',
      type: 'refund',
      gross: 30,
      net: -30,
      status: 'settled',
      method: 'pix',
    },
  ];

  it('filtra entradas liquidadas operacionais', () => {
    const rows = filterOperationalReportTxs(txs, { direction: 'in', status: 'settled' });
    expect(rows.map((t) => t.id)).toEqual(['in1', 'ref']);
  });

  it('filtra despesas liquidadas', () => {
    const rows = filterOperationalReportTxs(txs, { direction: 'out', status: 'settled' });
    expect(rows.map((t) => t.id)).toEqual(['out1']);
  });

  it('exclui pendentes quando status=settled', () => {
    const rows = filterOperationalReportTxs(txs, { status: 'settled' });
    expect(rows.some((t) => t.id === 'pend')).toBe(false);
    expect(rows).toHaveLength(3);
  });
});
