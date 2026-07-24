import { describe, it, expect } from 'vitest';
import {
  resolveEmpresaLegacyFinanceSectionRedirect,
  resolveEmpresaLegacyTabRedirect,
} from '../lib/empresaLegacyRedirects.js';

describe('empresaLegacyRedirects', () => {
  it('redireciona tarefas para processos em Tarefas', () => {
    expect(resolveEmpresaLegacyTabRedirect('tarefas')).toBe('/tarefas?tab=processos');
  });

  it('redireciona automacoes para gatilhos', () => {
    expect(resolveEmpresaLegacyTabRedirect('automacoes')).toBe('/automacoes?tab=gatilhos');
  });

  it('não trata contratos como aba legada (aba própria em Minha academia)', () => {
    expect(resolveEmpresaLegacyTabRedirect('contratos')).toBe(null);
  });

  it('redireciona section=contratos do Financeiro para a aba Contratos', () => {
    expect(resolveEmpresaLegacyFinanceSectionRedirect('contratos')).toBe('/empresa?tab=contratos');
  });

  it('preserva new/edit ao redirecionar section=contratos', () => {
    const params = new URLSearchParams('tab=financeiro&section=contratos&new=1');
    expect(resolveEmpresaLegacyFinanceSectionRedirect('contratos', params)).toBe(
      '/empresa?tab=contratos&new=1'
    );
    const editParams = new URLSearchParams('section=contratos&edit=tpl_1');
    expect(resolveEmpresaLegacyFinanceSectionRedirect('contratos', editParams)).toBe(
      '/empresa?tab=contratos&edit=tpl_1'
    );
  });
});
