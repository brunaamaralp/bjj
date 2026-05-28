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
  buildLojaAccordion,
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
  });

  it('isDirectNavPath for flat routes', () => {
    expect(isDirectNavPath('/students')).toBe(true);
    expect(isDirectNavPath('/automacoes')).toBe(false);
  });

  it('isAccordionChildActive for agente, contabilidade e grupos do financeiro', () => {
    expect(
      isAccordionChildActive(
        { id: 'agente', to: '/agente-ia' },
        { pathname: '/agente-ia', search: '' }
      )
    ).toBe(true);
    expect(
      isAccordionChildActive(
        { id: 'configuracao', to: '/financeiro?tab=configuracao' },
        { pathname: '/financeiro', search: '?tab=plano' }
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
        { id: 'mensalidades', to: '/financeiro?tab=mensalidades' },
        { pathname: '/financeiro', search: '?tab=mensalidades' }
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
    const financeiro = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.FINANCEIRO);
    expect(financeiro.label).toBe('Financeiro');
    expect(financeiro.children.some((c) => c.id === 'visao-geral')).toBe(true);
    expect(financeiro.children.some((c) => c.id === 'mensalidades')).toBe(true);
    expect(financeiro.children.some((c) => c.group === 'Operações' && c.id === 'movimentacoes')).toBe(true);
    expect(financeiro.children.some((c) => c.group === 'Contabilidade' && c.id === 'plano')).toBe(false);
    expect(financeiro.children.some((c) => c.id === 'configuracao')).toBe(true);
    expect(financeiro.children.some((c) => c.id === 'movimentacoes' && c.label === 'Caixa')).toBe(true);
    expect(model.financeDirect).toEqual([]);
  });

  it('buildRelatoriosAccordion mirrors Reports.jsx tab visibility', () => {
    const full = buildRelatoriosAccordion({
      modules: { finance: true, sales: true, inventory: true },
    });
    expect(full.children.map((c) => c.id)).toEqual([
      'visao-geral',
      'funil',
      'alunos',
      'financeiro',
      'loja',
      'estoque',
      'movimentacoes',
      'operador',
    ]);
    expect(full.children.find((c) => c.id === 'funil')?.label).toBe('Análise do Funil');

    const minimal = buildRelatoriosAccordion({
      modules: { finance: false, sales: false, inventory: false },
    });
    expect(minimal.children.map((c) => c.id)).toEqual(['visao-geral', 'funil', 'alunos']);
  });

  it('buildSidebarNavModel hides contabilidade for non-owner', () => {
    const model = buildSidebarNavModel({
      modules: { finance: true, inventory: false, sales: false },
      canConfigureAgenteIa: false,
      isOwner: false,
    });
    const financeiro = model.accordions.find((a) => a.id === NAV_ACCORDION_IDS.FINANCEIRO);
    expect(financeiro.children.some((c) => c.group === 'Contabilidade')).toBe(false);
    expect(financeiro.children.some((c) => c.id === 'conciliacao')).toBe(false);
    expect(financeiro.children.some((c) => c.id === 'configuracao')).toBe(false);
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
    expect(none.map((s) => s.title)).not.toContain('Vendas');
  });
});
