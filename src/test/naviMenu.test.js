import { describe, it, expect } from 'vitest';
import {
  getNewLeadLabel,
  buildMobileDrawerSections,
  buildSidebarNavModel,
  matchNavTarget,
  getAccordionIdForLocation,
  isDirectNavPath,
  isAccordionChildActive,
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
    expect(getAccordionIdForLocation({ pathname: '/caixa', search: '?tab=movimentacoes' })).toBe('caixa');
    expect(getAccordionIdForLocation({ pathname: '/caixa', search: '?tab=fechamento' })).toBe('caixa');
    expect(getAccordionIdForLocation({ pathname: '/loja', search: '?tab=vendas' })).toBe('loja');
    expect(getAccordionIdForLocation({ pathname: '/students', search: '' })).toBe(null);
  });

  it('isDirectNavPath for flat routes', () => {
    expect(isDirectNavPath('/students')).toBe(true);
    expect(isDirectNavPath('/automacoes')).toBe(false);
  });

  it('isAccordionChildActive for agente and contabilidade', () => {
    expect(
      isAccordionChildActive(
        { id: 'agente', to: '/automacoes?tab=agente' },
        { pathname: '/agente-ia', search: '' }
      )
    ).toBe(true);
    expect(
      isAccordionChildActive(
        { id: 'contabilidade', to: '/caixa?tab=contabilidade' },
        { pathname: '/caixa', search: '?tab=plano' }
      )
    ).toBe(true);
  });

  it('buildSidebarNavModel respects modules', () => {
    const model = buildSidebarNavModel({
      modules: { finance: true, inventory: true, sales: true },
      canConfigureAgenteIa: true,
      pipelineLabel: 'Funil',
      navStudentsLabel: 'Alunos',
      newLeadLabel: 'Novo Lead',
    });
    expect(model.accordions.map((a) => a.id)).toContain('caixa');
    expect(model.accordions.map((a) => a.id)).toContain('loja');
    const auto = model.accordions.find((a) => a.id === 'automacoes');
    expect(auto.children.map((c) => c.id)).toEqual(['modelos', 'configuracoes', 'agente']);
    const caixa = model.accordions.find((a) => a.id === 'caixa');
    expect(caixa.children.map((c) => c.to)).toEqual([
      '/caixa?tab=movimentacoes',
      '/caixa?tab=fechamento',
      '/caixa?tab=contabilidade',
    ]);
    const loja = model.accordions.find((a) => a.id === 'loja');
    expect(loja.children.map((c) => c.id)).toEqual(['vendas', 'produtos', 'estoque']);
  });

  it('buildMobileDrawerSections respects modules', () => {
    const all = buildMobileDrawerSections({
      modules: { finance: true, inventory: true, sales: true },
      navRole: 'owner',
      canConfigureAgenteIa: true,
      pipelineLabel: 'Funil',
    });
    const titles = all.map((s) => s.title);
    expect(titles).toContain('Financeiro');
    expect(titles).toContain('Loja');

    const none = buildMobileDrawerSections({
      modules: { finance: false, inventory: false, sales: false },
      navRole: 'member',
      canConfigureAgenteIa: false,
      pipelineLabel: 'Funil',
    });
    expect(none.map((s) => s.title)).not.toContain('Financeiro');
    expect(none.map((s) => s.title)).not.toContain('Loja');
  });
});
