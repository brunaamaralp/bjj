import { describe, expect, it } from 'vitest';
import { montarLancamento } from '../components/finance/montarLancamento.js';
import {
  findAccountCodeByCategoryLabel,
  resolveCashAccountCode,
  resolveExpenseAccountCode,
} from '../lib/ledgerAccountResolve.js';

const standardAccounts = [
  { id: 'acc-caixa', code: '1.1.1', name: 'Caixa', type: 'ativo', nature: 'devedora', cash: true },
  { id: 'acc-receita', code: '4.1.1', name: 'Receita de Vendas', type: 'receita', nature: 'credora' },
  { id: 'acc-desp', code: '6.2.1', name: 'Despesas Gerais e Adm', type: 'despesa', nature: 'devedora' },
];

const gblpAccounts = [
  { id: 'gblp-mens', code: '1.1.1', name: 'Mensalidades', type: 'receita', cash: false },
  { id: 'gblp-manut', code: '3.1.6', name: 'Manutenção e Reparos', type: 'despesa', cash: false },
  { id: 'gblp-cash', code: '3', name: 'Despesas Operacionais', type: 'despesa', cash: true },
];

describe('ledgerAccountResolve', () => {
  it('resolveCashAccountCode evita 1.1.1 quando é receita', () => {
    expect(resolveCashAccountCode(gblpAccounts)).toBe('3');
  });

  it('resolveExpenseAccountCode mapeia Manutenção para 3.1.6', () => {
    expect(resolveExpenseAccountCode(gblpAccounts, '6.2.1', 'Manutenção')).toBe('3.1.6');
  });

  it('findAccountCodeByCategoryLabel encontra por substring', () => {
    expect(findAccountCodeByCategoryLabel(gblpAccounts, 'Manutenção', { types: ['despesa'] })).toBe('3.1.6');
  });
});

describe('montarLancamento', () => {
  it('mantém espelho no plano padrão', () => {
    const entry = montarLancamento(
      {
        id: 'tx-std',
        type: 'expense_operational',
        category: 'Manutenção',
        gross: 50,
        status: 'settled',
        settledAt: '2026-06-01T12:00:00.000Z',
      },
      standardAccounts,
      'academy-1'
    );
    expect(entry?.lines).toHaveLength(2);
    expect(entry.lines[0].accountId).toBe('acc-desp');
    expect(entry.lines[1].accountId).toBe('acc-caixa');
  });

  it('espelha despesa Manutenção no plano customizado GBLP', () => {
    const entry = montarLancamento(
      {
        id: '6a3e5a0f0037646bd19b',
        type: 'expense_operational',
        category: 'Manutenção',
        planName: 'Compra de frutas/copos',
        gross: 70.97,
        fee: 0,
        direction: 'out',
        status: 'settled',
        settledAt: '2026-06-26T10:53:03.468Z',
      },
      gblpAccounts,
      '699f21b70006985daa90'
    );
    expect(entry).not.toBeNull();
    expect(entry.lines).toHaveLength(2);
    expect(entry.lines[0].accountId).toBe('gblp-manut');
    expect(entry.lines[1].accountId).toBe('gblp-cash');
    expect(entry.memo).toContain('6a3e5a0f0037646bd19b');
  });

  it('espelha mensalidade com caixa e receita corretos no plano GBLP', () => {
    const entry = montarLancamento(
      {
        id: 'tx-plan',
        type: 'plan',
        category: 'Mensalidades',
        gross: 200,
        status: 'settled',
        settledAt: '2026-06-01T12:00:00.000Z',
      },
      gblpAccounts,
      '699f21b70006985daa90'
    );
    expect(entry?.lines).toHaveLength(2);
    expect(entry.lines[0].accountId).toBe('gblp-cash');
    expect(entry.lines[1].accountId).toBe('gblp-mens');
  });
});
