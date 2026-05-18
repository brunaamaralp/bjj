import { describe, it, expect } from 'vitest';
import { getNewLeadLabel, buildMobileDrawerSections } from '../lib/naviMenu.js';

describe('naviMenu', () => {
  it('getNewLeadLabel singularizes', () => {
    expect(getNewLeadLabel('Alunos')).toBe('Novo Aluno');
    expect(getNewLeadLabel('Leads')).toBe('Novo Lead');
  });

  it('buildMobileDrawerSections respects modules', () => {
    const all = buildMobileDrawerSections({
      modules: { finance: true, inventory: true, sales: true },
      navRole: 'owner',
      canConfigureAgenteIa: true,
      myWorkspaceLabel: 'Empresa',
    });
    const titles = all.map((s) => s.title);
    expect(titles).toContain('Financeiro');
    expect(titles).toContain('Loja');
    expect(titles).toContain('Conta & Plataforma');

    const none = buildMobileDrawerSections({
      modules: { finance: false, inventory: false, sales: false },
      navRole: 'member',
      canConfigureAgenteIa: false,
      myWorkspaceLabel: 'Empresa',
    });
    expect(none.map((s) => s.title)).not.toContain('Financeiro');
    expect(none.map((s) => s.title)).not.toContain('Loja');
  });
});
