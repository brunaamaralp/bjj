import { describe, it, expect } from 'vitest';
import {
  findJournalEntryForTx,
  formatJournalLineDisplay,
  buildJournalMirrorRows,
  resolveTxJournalMirror,
  txJournalMirrorStatusMessage,
  buildAccountById,
} from '../lib/financeTxJournalMirror.js';

const accounts = [
  { id: 'acc-caixa', code: '1.1.1', name: 'Caixa', type: 'ativo', nature: 'devedora' },
  { id: 'acc-receita', code: '4.1.1', name: 'Receita de Vendas', type: 'receita', nature: 'credora' },
  { id: 'acc-fin', code: '7.1.1', name: 'Despesas Financeiras', type: 'despesa', nature: 'devedora' },
];

const accountById = buildAccountById(accounts);

describe('financeTxJournalMirror', () => {
  it('findJournalEntryForTx prioriza financial_tx_id', () => {
    const entries = [
      { id: 'j1', memo: 'Outro', financial_tx_id: 'tx-other', lines: [] },
      { id: 'j2', memo: 'Liquidação: X', financial_tx_id: 'tx-1', lines: [{ accountId: 'acc-caixa', debit: 100, credit: 0 }] },
    ];
    expect(findJournalEntryForTx(entries, 'tx-1')?.id).toBe('j2');
  });

  it('findJournalEntryForTx fallback memo legado', () => {
    const entries = [
      { id: 'j3', memo: 'Liquidação: Mensalidades · tx-legacy', lines: [] },
    ];
    expect(findJournalEntryForTx(entries, 'tx-legacy')?.id).toBe('j3');
  });

  it('formatJournalLineDisplay debito e credito', () => {
    expect(formatJournalLineDisplay({ accountId: 'acc-caixa', debit: 150, credit: 0 }, accountById)).toMatch(/^D 1\.1\.1 Caixa/);
    expect(formatJournalLineDisplay({ accountId: 'acc-receita', debit: 0, credit: 150 }, accountById)).toMatch(/^C 4\.1\.1 Receita/);
  });

  it('buildJournalMirrorRows estrutura D/C para tabela', () => {
    const rows = buildJournalMirrorRows(
      [
        { accountId: 'acc-caixa', debit: 150, credit: 0 },
        { accountId: 'acc-receita', debit: 0, credit: 150 },
      ],
      accountById
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ side: 'debit', sideLabel: 'D', accountCode: '1.1.1', accountName: 'Caixa' });
    expect(rows[1]).toMatchObject({ side: 'credit', sideLabel: 'C', accountCode: '4.1.1' });
  });

  it('resolveTxJournalMirror pending', () => {
    const r = resolveTxJournalMirror({
      tx: { id: 'tx-p', status: 'pending', type: 'plan', gross: 100 },
      accounts,
      journalEntries: [],
    });
    expect(r.state).toBe('pending');
    expect(txJournalMirrorStatusMessage(r.state)).toContain('liquidar');
  });

  it('resolveTxJournalMirror cancelled', () => {
    const r = resolveTxJournalMirror({
      tx: { id: 'tx-c', status: 'cancelled' },
      accounts,
    });
    expect(r.state).toBe('cancelled');
  });

  it('resolveTxJournalMirror posted from journal', () => {
    const lines = [
      { accountId: 'acc-caixa', debit: 200, credit: 0 },
      { accountId: 'acc-receita', debit: 0, credit: 200 },
    ];
    const r = resolveTxJournalMirror({
      tx: { id: 'tx-s', status: 'settled', type: 'plan', gross: 200, category: 'Mensalidades' },
      accounts,
      journalEntries: [{ financial_tx_id: 'tx-s', memo: 'Liquidação', lines }],
    });
    expect(r.state).toBe('posted');
    expect(r.displayLines).toHaveLength(2);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].side).toBe('debit');
  });

  it('resolveTxJournalMirror preview when settled sem journal', () => {
    const r = resolveTxJournalMirror({
      tx: {
        id: 'tx-prev',
        status: 'settled',
        type: 'plan',
        gross: 350,
        category: 'Mensalidades',
        settledAt: '2026-06-15T12:00:00.000Z',
      },
      accounts,
      journalEntries: [],
      academyId: 'acad-1',
    });
    expect(r.state).toBe('preview');
    expect(r.displayLines?.length).toBeGreaterThanOrEqual(2);
  });

  it('resolveTxJournalMirror fee dupla no preview', () => {
    const r = resolveTxJournalMirror({
      tx: {
        id: 'tx-fee',
        status: 'settled',
        type: 'plan',
        gross: 100,
        fee: 5,
        category: 'Mensalidades',
        settledAt: '2026-06-15T12:00:00.000Z',
      },
      accounts,
      journalEntries: [],
      academyId: 'acad-1',
    });
    expect(r.state).toBe('preview');
    expect(r.displayLines?.length).toBeGreaterThanOrEqual(4);
  });

  it('resolveTxJournalMirror post_missing sem contas', () => {
    const r = resolveTxJournalMirror({
      tx: { id: 'tx-m', status: 'settled', type: 'plan', gross: 100 },
      accounts: [],
      journalEntries: [],
    });
    expect(r.state).toBe('post_missing');
  });
});
