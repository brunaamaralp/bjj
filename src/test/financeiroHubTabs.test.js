import { describe, it, expect } from 'vitest';
import { resolveHubTab } from '../lib/hubTabs.js';
import {
  getFinanceiroDefaultTab,
  hasExplicitFinanceiroTabParam,
  buildFinanceiroAllowedLeafTabs,
  buildFinanceiroHubTabItems,
  FINANCEIRO_SECTIONS,
  FINANCEIRO_EXTRATO_TAB,
  isFinanceiroExtratoLegacyTab,
  financeiroExtratoLegacyRedirect,
  EMPRESA_FINANCE_RAZAO_PATH,
  buildEmpresaFinanceRazaoPath,
  buildFinanceLancamentosPath,
  FINANCE_STATEMENT_VIEWS,
} from '../lib/financeiroHubTabs.js';
import { FINANCE_REGIME } from '../lib/financeCompetence.js';

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

  it('buildFinanceiroAllowedLeafTabs — member com a pagar, sem previsão nem fechamento', () => {
    const allowed = new Set(
      buildFinanceiroAllowedLeafTabs({ navRole: 'member', financeModule: true })
    );
    expect(allowed.has(FINANCEIRO_SECTIONS.A_PAGAR)).toBe(true);
    expect(allowed.has('previsao')).toBe(false);
    expect(allowed.has('fechamento')).toBe(false);
    expect(allowed.has('conciliacao')).toBe(false);
    expect(allowed.has(FINANCEIRO_EXTRATO_TAB)).toBe(false);
    expect(allowed.has('movimentacoes')).toBe(true);
    expect(allowed.has(FINANCEIRO_SECTIONS.MENSALIDADES)).toBe(false);
    expect(allowed.has(FINANCEIRO_SECTIONS.A_RECEBER)).toBe(true);
  });

  it('buildFinanceiroAllowedLeafTabs — admin com previsão e DRE, sem conciliação', () => {
    const allowed = new Set(
      buildFinanceiroAllowedLeafTabs({ navRole: 'admin', financeModule: true })
    );
    expect(allowed.has('previsao')).toBe(true);
    expect(allowed.has('fechamento')).toBe(true);
    expect(allowed.has('dre')).toBe(true);
    expect(allowed.has('conciliacao')).toBe(false);
    expect(allowed.has(FINANCEIRO_EXTRATO_TAB)).toBe(false);
  });

  it('buildFinanceiroAllowedLeafTabs — owner sem aba extrato', () => {
    const allowed = new Set(
      buildFinanceiroAllowedLeafTabs({ navRole: 'owner', financeModule: true })
    );
    expect(allowed.has('conciliacao')).toBe(true);
    expect(allowed.has(FINANCEIRO_EXTRATO_TAB)).toBe(false);
  });

  it('isFinanceiroExtratoLegacyTab e redirect para razão em config', () => {
    expect(isFinanceiroExtratoLegacyTab('extrato')).toBe(true);
    expect(isFinanceiroExtratoLegacyTab('razao')).toBe(true);
    expect(isFinanceiroExtratoLegacyTab('movimentacoes')).toBe(false);
    expect(financeiroExtratoLegacyRedirect()).toBe(EMPRESA_FINANCE_RAZAO_PATH);
  });

  it('buildEmpresaFinanceRazaoPath com contexto de transação', () => {
    expect(buildEmpresaFinanceRazaoPath()).toBe(EMPRESA_FINANCE_RAZAO_PATH);
    const path = buildEmpresaFinanceRazaoPath({ from: 'tx', txId: 'tx-abc' });
    expect(path).toContain('section=razao-contabil');
    expect(path).toContain('from=tx');
    expect(path).toContain('txId=tx-abc');
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
      FINANCEIRO_SECTIONS.A_PAGAR,
      'movimentacoes',
      FINANCEIRO_SECTIONS.OVERVIEW,
    ]);
  });

  it('buildFinanceiroHubTabItems — owner inicia em visão geral', () => {
    const tabs = buildFinanceiroHubTabItems({ navRole: 'owner', financeModule: true });
    expect(tabs[0].id).toBe(FINANCEIRO_SECTIONS.OVERVIEW);
    expect(tabs.some((t) => t.id === 'conciliacao')).toBe(true);
    expect(tabs.some((t) => t.id === 'dre')).toBe(true);
    expect(tabs.some((t) => t.id === FINANCEIRO_EXTRATO_TAB)).toBe(false);
  });

  it('buildFinanceiroHubTabItems — shortLabel em abas longas no mobile', () => {
    const tabs = buildFinanceiroHubTabItems({ navRole: 'owner', financeModule: true });
    const fechamento = tabs.find((t) => t.id === 'fechamento');
    expect(fechamento?.label).toBe('Conferência do mês');
    expect(fechamento?.shortLabel).toBe('Conferência');
  });

  it('buildFinanceLancamentosPath — deep link com categoria, mês e regime', () => {
    expect(
      buildFinanceLancamentosPath({
        month: '2026-03',
        category: 'Mensalidade',
        regime: FINANCE_REGIME.COMPETENCE,
      })
    ).toBe('/financeiro?tab=movimentacoes&month=2026-03&q=Mensalidade&regime=competence');

    expect(buildFinanceLancamentosPath({ month: '2026-03', regime: FINANCE_REGIME.CASH })).toBe(
      '/financeiro?tab=movimentacoes&month=2026-03&regime=cash'
    );
  });

  it('FINANCE_STATEMENT_VIEWS expõe dre e dfc', () => {
    expect(FINANCE_STATEMENT_VIEWS.DRE).toBe('dre');
    expect(FINANCE_STATEMENT_VIEWS.DFC).toBe('dfc');
  });
});
