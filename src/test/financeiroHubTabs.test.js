import { describe, it, expect } from 'vitest';
import { resolveHubTab } from '../lib/hubTabs.js';
import {
  getFinanceiroDefaultTab,
  hasExplicitFinanceiroTabParam,
  buildFinanceiroAllowedLeafTabs,
  buildFinanceiroHubTabItems,
  FINANCEIRO_SECTIONS,
  FINANCEIRO_EXTRATO_TAB,
} from '../lib/financeiroHubTabs.js';

describe('financeiroHubTabs', () => {
  it('hasExplicitFinanceiroTabParam', () => {
    expect(hasExplicitFinanceiroTabParam(null)).toBe(false);
    expect(hasExplicitFinanceiroTabParam('')).toBe(false);
    expect(hasExplicitFinanceiroTabParam('  ')).toBe(false);
    expect(hasExplicitFinanceiroTabParam('mensalidades')).toBe(true);
  });

  it('getFinanceiroDefaultTab — gestores em visão geral, member em a receber', () => {
    expect(getFinanceiroDefaultTab({ isOwner: true })).toBe(FINANCEIRO_SECTIONS.OVERVIEW);
    expect(getFinanceiroDefaultTab({ isAdmin: true })).toBe(FINANCEIRO_SECTIONS.OVERVIEW);
    expect(getFinanceiroDefaultTab({ isOwner: false, isAdmin: false })).toBe(
      FINANCEIRO_SECTIONS.A_RECEBER
    );
    expect(getFinanceiroDefaultTab('member')).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
    expect(getFinanceiroDefaultTab('admin')).toBe(FINANCEIRO_SECTIONS.OVERVIEW);
  });

  it('buildFinanceiroAllowedLeafTabs — member sem previsão nem fechamento', () => {
    const allowed = new Set(
      buildFinanceiroAllowedLeafTabs({ navRole: 'member', financeModule: true })
    );
    expect(allowed.has('previsao')).toBe(false);
    expect(allowed.has('fechamento')).toBe(false);
    expect(allowed.has('conciliacao')).toBe(false);
    expect(allowed.has(FINANCEIRO_EXTRATO_TAB)).toBe(false);
    expect(allowed.has('movimentacoes')).toBe(true);
    expect(allowed.has(FINANCEIRO_SECTIONS.MENSALIDADES)).toBe(false);
    expect(allowed.has(FINANCEIRO_SECTIONS.A_RECEBER)).toBe(true);
  });

  it('buildFinanceiroAllowedLeafTabs — admin com previsão, sem conciliação', () => {
    const allowed = new Set(
      buildFinanceiroAllowedLeafTabs({ navRole: 'admin', financeModule: true })
    );
    expect(allowed.has('previsao')).toBe(true);
    expect(allowed.has('fechamento')).toBe(true);
    expect(allowed.has('conciliacao')).toBe(false);
    expect(allowed.has(FINANCEIRO_EXTRATO_TAB)).toBe(false);
  });

  it('buildFinanceiroAllowedLeafTabs — owner com menu completo', () => {
    const allowed = new Set(
      buildFinanceiroAllowedLeafTabs({ navRole: 'owner', financeModule: true })
    );
    expect(allowed.has('conciliacao')).toBe(true);
    expect(allowed.has(FINANCEIRO_EXTRATO_TAB)).toBe(true);
  });

  it('member em ?tab= legado redireciona para a receber', () => {
    const allowed = new Set(
      buildFinanceiroAllowedLeafTabs({ navRole: 'member', financeModule: true })
    );
    const fallback = getFinanceiroDefaultTab('member');
    expect(resolveHubTab('mensalidades', allowed, fallback)).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
    expect(resolveHubTab('previsao', allowed, fallback)).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
    expect(resolveHubTab('fechamento', allowed, fallback)).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
  });

  it('buildFinanceiroHubTabItems — ordem member prioriza a receber', () => {
    const tabs = buildFinanceiroHubTabItems({ navRole: 'member', financeModule: true });
    expect(tabs.map((t) => t.id)).toEqual([
      FINANCEIRO_SECTIONS.A_RECEBER,
      'movimentacoes',
      FINANCEIRO_SECTIONS.OVERVIEW,
    ]);
  });

  it('buildFinanceiroHubTabItems — owner inicia em visão geral', () => {
    const tabs = buildFinanceiroHubTabItems({ navRole: 'owner', financeModule: true });
    expect(tabs[0].id).toBe(FINANCEIRO_SECTIONS.OVERVIEW);
    expect(tabs.some((t) => t.id === 'conciliacao')).toBe(true);
  });

  it('buildFinanceiroHubTabItems — shortLabel em abas longas no mobile', () => {
    const tabs = buildFinanceiroHubTabItems({ navRole: 'owner', financeModule: true });
    const fechamento = tabs.find((t) => t.id === 'fechamento');
    expect(fechamento?.label).toBe('Conferência do mês');
    expect(fechamento?.shortLabel).toBe('Conferência');
    const extrato = tabs.find((t) => t.id === FINANCEIRO_EXTRATO_TAB);
    expect(extrato?.label).toBe('Extrato contábil');
    expect(extrato?.shortLabel).toBe('Extrato');
  });
});
