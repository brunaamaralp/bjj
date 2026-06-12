import { describe, it, expect } from 'vitest';
import {
  getNewLeadLabel,
  buildMobileDrawerSections,
  buildSidebarNavModel,
  buildRelatoriosAccordion,
  matchNavTarget,
  getAccordionIdForLocation,
  isDirectNavPath,
  isAccordionChildActive,
  NAV_ACCORDION_IDS,
  NOVA_VENDA_MENU_ACTION,
  NOVO_LANCAMENTO_MENU_ACTION,
  buildLojaAccordion,
  buildFinanceiroAccordion,
} from '../lib/naviMenu.js';

describe('naviMenu', () => {
  it('getNewLeadLabel singularizes', () => {
    expect(getNewLeadLabel('Alunos')).toBe('Novo Aluno');
    expect(getNewLeadLabel('Leads')).toBe('Novo Lead');
  });

  it('matchNavTarget respects query string', () => {
    expect(
      matchNavTarget('/automacoes?tab=modelos', { pathname: '/automacoes', search: '?tab=modelos' })
    ).toBe(true);
    expect(
      matchNavTarget('/automacoes?tab=modelos', { pathname: '/automacoes', search: '?tab=configuracoes' })
    ).toBe(false);
  });

  it('getAccordionIdForLocation maps hub routes', () => {
    expect(getAccordionIdForLocation({ pathname: '/automacoes', search: '' })).toBe('automacoes');
    expect(getAccordionIdForLocation({ pathname: '/agente-ia', search: '' })).toBe('automacoes');
    expect(getAccordionIdForLocation({ pathname: '/financeiro', search: '?tab=movimentacoes' })).toBe(
      'financeiro'
    );
    expect(getAccordionIdForLocation({ pathname: '/caixa', search: '?tab=fechamento' })).toBe('financeiro');
    expect(getAccordionIdForLocation({ pathname: '/loja', search: '?tab=vendas' })).toBe('loja');
    expect(getAccordionIdForLocation({ pathname: '/students', search: '' })).toBe(null);
    expect(getAccordionIdForLocation({ pathname: '/reports', search: '?tab=funil' })).toBe('loja');
  });

  it('isDirectNavPath for flat routes', () => {
    expect(isDirectNavPath('/students')).toBe(true);
    expect(isDirectNavPath('/automacoes')).toBe(false);
  });

  it('isAccordionChildActive for agente e grupos do financeiro', () => {
    expect(
      isAccordionChildActive(
        { id: 'agente', to: '/agente-ia' },
        { pathname: '/agente-ia', search: '' }
      )
    ).toBe(true);
    expect(
      isAccordionChildActive(
        { id: 'movimentacoes', to: '/financeiro?tab=movimentacoes', group: 'Operações' },
        { pathname: '/financeiro', search: '?tab=movimentacoes' }
      )
    ).toBe(true);
    expect(
      isAccordionChildActive(
        { id: 'a-receber', to: '/financeiro?tab=a-receber&section=mensalidades' },
        { pathname: '/financeiro', search: '?tab=a-receber&section=mensalidades' }
      )
    ).toBe(true);
    expect(
      isAccordionChildActive(
        { id: 'a-receber', to: '/financeiro?tab=a-receber&section=mensalidades' },
        { pathname: '/financeiro', search: '?tab=mensalidades' }
      )
    ).toBe(true);
    expect(
      isAccordionChildActive(
        { id: 'a-receber', to: '/financeiro?tab=a-receber&section=mensalidades' },
        { pathname: '/mensalidades', search: '' }
      )
    ).toBe(true);
    expect(
      isAccordionChildActive(
        { id: 'previsao', to: '/financeiro?tab=previsao', group: 'Operações' },
        { pathname: '/financeiro', search: '?tab=movimentacoes' }
      )
    ).toBe(false);
    expect(
      isAccordionChildActive(
        { id: 'movimentacoes', to: '/financeiro?tab=movimentacoes', group: 'Operações' },
        { pathname: '/financeiro', search: '?tab=previsao' }
      )
    ).toBe(false);
  });

  it('buildLojaAccordion lists Nova venda first when sales enabled', () => {
    const loja = buildLojaAccordion({ modules: { sales: true, inventory: true } });
    expect(loja.children[0]).toMatchObject({
      id: 'nova-venda',
      label: 'Nova venda',
      action: NOVA_VENDA_MENU_ACTION,
    });
    expect(loja.children[1].id).toBe('vendas');
    expect(loja.children[loja.children.length - 1]).toMatchObject({
      id: 'relatorios',
      label: 'Relatórios',
      to: '/reports?tab=funil',
    });
    const estoqueIdx = loja.children.findIndex((c) => c.id === 'estoque');
    const relIdx = loja.children.findIndex((c) => c.id === 'relatorios');
    expect(relIdx).toBe(estoqueIdx + 1);
  });

  it('buildSidebarNavModel respects modules and owner', () => {
    const model = buildSidebarNavModel({
      modules: { finance: true, inventory: true, sales: true },
      canConfigureAgenteIa: true,
      pipelineLabel: 'Funil',
      navStudentsLabel: 'Alunos',
      newLeadLabel: 'Novo Lead',
      isOwner: true,
    });
    expect(model.accordions.map((a) => a.id)).toContain('financeiro');
    expect(model.accordions.map((a) => a.id)).toContain('loja');
    expect(model.accordions.map((a) => a.id)).not.toContain('relatorios');
    const loja = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.LOJA);
    expect(loja.children.some((c) => c.id === 'relatorios')).toBe(true);
    const financeiro = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.FINANCEIRO);
    expect(financeiro.label).toBe('Financeiro');
    expect(financeiro.children.some((c) => c.id === 'visao-geral')).toBe(true);
    expect(financeiro.children.some((c) => c.id === 'a-receber')).toBe(true);
    expect(financeiro.children[0]).toMatchObject({
      id: 'novo-lancamento',
      label: 'Novo lançamento',
      action: NOVO_LANCAMENTO_MENU_ACTION,
    });
    expect(financeiro.children.some((c) => c.id === 'visao-geral')).toBe(true);
    expect(financeiro.children.some((c) => c.id === 'movimentacoes' && c.label === 'Lançamentos')).toBe(true);
    expect(financeiro.children.some((c) => c.id === 'previsao')).toBe(false);
    expect(financeiro.children.some((c) => c.id === 'fechamento')).toBe(false);
    expect(financeiro.children.some((c) => c.id === 'conciliacao')).toBe(false);
    expect(financeiro.children.some((c) => c.id === 'extrato')).toBe(false);
    expect(model.financeDirect).toEqual([]);
  });

  it('buildRelatoriosAccordion is a single sidebar link (tabs live in Reports.jsx)', () => {
    const rel = buildRelatoriosAccordion();
    expect(rel.linkOnly).toBe(true);
    expect(rel.children).toEqual([]);
    expect(rel.defaultTo).toBe('/reports?tab=funil');
  });

  it('buildSidebarNavModel — member sem visão geral nem abas avançadas na sidebar', () => {
    const model = buildSidebarNavModel({
      modules: { finance: true, inventory: false, sales: false },
      canConfigureAgenteIa: false,
      navRole: 'member',
      isOwner: false,
    });
    const financeiro = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.FINANCEIRO);
    expect(financeiro.children.some((c) => c.id === 'novo-lancamento')).toBe(true);
    expect(financeiro.children.some((c) => c.id === 'visao-geral')).toBe(false);
    expect(financeiro.children.some((c) => c.id === 'conciliacao')).toBe(false);
    expect(financeiro.children.some((c) => c.id === 'extrato')).toBe(false);
  });

  it('buildFinanceiroAccordion — admin com visão geral, sem extrato na sidebar', () => {
    const financeiro = buildFinanceiroAccordion({ navRole: 'admin', financeModule: true });
    expect(financeiro.children.some((c) => c.id === 'visao-geral')).toBe(true);
    expect(financeiro.children.some((c) => c.id === 'extrato')).toBe(false);
    expect(financeiro.children.some((c) => c.id === 'previsao')).toBe(false);
  });

  it('buildMobileDrawerSections respects modules', () => {
    const all = buildMobileDrawerSections({
      modules: { finance: true, inventory: true, sales: true },
      isOwner: true,
      canConfigureAgenteIa: true,
      pipelineLabel: 'Funil',
    });
    const titles = all.map((s) => s.title);
    expect(titles).toContain('Financeiro');
    expect(titles).toContain('Vendas');

    const none = buildMobileDrawerSections({
      modules: { finance: false, inventory: false, sales: false },
      isOwner: false,
      canConfigureAgenteIa: false,
      pipelineLabel: 'Funil',
    });
    expect(none.map((s) => s.title)).not.toContain('Financeiro');
    const vendasSection = none.find((s) => s.title === 'Vendas');
    expect(vendasSection?.items).toEqual([
      expect.objectContaining({ id: 'relatorios', label: 'Relatórios' }),
    ]);
  });
});
