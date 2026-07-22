import { describe, it, expect } from 'vitest';
import {
  RECEIVABLES_SECTIONS,
  parseReceivablesSection,
  getDefaultReceivablesSection,
  buildReceivablesSearchParams,
  normalizeLegacyFinanceiroTab,
  filterReceivablesForSection,
} from '../lib/financeiroReceivablesSections.js';
import { FINANCEIRO_SECTIONS } from '../lib/financeiroHubTabs.js';
import { RECEIVABLE_SOURCE } from '../lib/receivablesAggregate.js';

describe('financeiroReceivablesSections', () => {
  it('parseReceivablesSection — default visao quando ausente', () => {
    expect(parseReceivablesSection(new URLSearchParams(''))).toBe(RECEIVABLES_SECTIONS.VISAO);
  });

  it('parseReceivablesSection — mensalidades explícita', () => {
    const p = new URLSearchParams('section=mensalidades');
    expect(parseReceivablesSection(p)).toBe(RECEIVABLES_SECTIONS.MENSALIDADES);
  });

  it('getDefaultReceivablesSection — member em mensalidades', () => {
    expect(getDefaultReceivablesSection('member')).toBe(RECEIVABLES_SECTIONS.MENSALIDADES);
    expect(getDefaultReceivablesSection({ isOwner: false, isAdmin: false })).toBe(
      RECEIVABLES_SECTIONS.MENSALIDADES
    );
  });

  it('getDefaultReceivablesSection — gestor em visao', () => {
    expect(getDefaultReceivablesSection('owner')).toBe(RECEIVABLES_SECTIONS.VISAO);
    expect(getDefaultReceivablesSection({ isOwner: true })).toBe(RECEIVABLES_SECTIONS.VISAO);
  });

  it('parseReceivablesSection — cobranca explícita', () => {
    const p = new URLSearchParams('section=cobranca');
    expect(parseReceivablesSection(p)).toBe(RECEIVABLES_SECTIONS.COBRANCA);
  });

  it('buildReceivablesSearchParams — cobranca e pay deep link', () => {
    const p = buildReceivablesSearchParams({
      section: RECEIVABLES_SECTIONS.COBRANCA,
    });
    expect(p.get('section')).toBe('cobranca');
    const pay = buildReceivablesSearchParams({
      section: RECEIVABLES_SECTIONS.MENSALIDADES,
      search: 'Maria',
      extra: { pay_student: 's1', pay_month: '2026-05' },
    });
    expect(pay.get('pay_student')).toBe('s1');
    expect(pay.get('pay_month')).toBe('2026-05');
  });

  it('normalizeLegacyFinanceiroTab — filtro overdue permanece em mensalidades', () => {
    const input = new URLSearchParams('tab=a-receber&section=mensalidades&filtro=overdue');
    const out = normalizeLegacyFinanceiroTab(input);
    expect(out.section).toBe(RECEIVABLES_SECTIONS.MENSALIDADES);
    expect(out.filtro).toBe('overdue');
    expect(out.changed).toBe(false);
  });

  it('buildReceivablesSearchParams — preserva search e filtro', () => {
    const p = buildReceivablesSearchParams({
      section: RECEIVABLES_SECTIONS.MENSALIDADES,
      search: 'Maria',
      filtro: 'overdue',
    });
    expect(p.get('tab')).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
    expect(p.get('section')).toBe('mensalidades');
    expect(p.get('search')).toBe('Maria');
    expect(p.get('filtro')).toBe('overdue');
  });

  it('normalizeLegacyFinanceiroTab — mensalidades vira a-receber + section', () => {
    const input = new URLSearchParams('tab=mensalidades&search=joao&filtro=pending');
    const out = normalizeLegacyFinanceiroTab(input);
    expect(out.tab).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
    expect(out.section).toBe(RECEIVABLES_SECTIONS.MENSALIDADES);
    expect(out.search).toBe('joao');
    expect(out.filtro).toBe('pending');
  });

  it('filterReceivablesForSection — mensalidades retorna apenas mensalidade', () => {
    const rows = [
      { id: 'm1', source: RECEIVABLE_SOURCE.MENSALIDADE },
      { id: 'l1', source: RECEIVABLE_SOURCE.LANCAMENTO },
      { id: 'v1', source: RECEIVABLE_SOURCE.VENDA },
    ];
    const out = filterReceivablesForSection(RECEIVABLES_SECTIONS.MENSALIDADES, rows);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('m1');
  });

  it('filterReceivablesForSection — outros exclui mensalidades', () => {
    const rows = [
      { id: 'm1', source: RECEIVABLE_SOURCE.MENSALIDADE },
      { id: 'l1', source: RECEIVABLE_SOURCE.LANCAMENTO },
      { id: 'v1', source: RECEIVABLE_SOURCE.VENDA },
    ];
    const out = filterReceivablesForSection(RECEIVABLES_SECTIONS.OUTROS, rows);
    expect(out.map((r) => r.id)).toEqual(['l1', 'v1']);
  });

  it('filterReceivablesForSection — visao retorna tudo sem filtro', () => {
    const rows = [
      { id: 'm1', source: RECEIVABLE_SOURCE.MENSALIDADE },
      { id: 'l1', source: RECEIVABLE_SOURCE.LANCAMENTO },
    ];
    const out = filterReceivablesForSection(RECEIVABLES_SECTIONS.VISAO, rows);
    expect(out).toEqual(rows);
  });
});
