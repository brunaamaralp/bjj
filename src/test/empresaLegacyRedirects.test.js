import { describe, it, expect } from 'vitest';
import { resolveEmpresaLegacyTabRedirect } from '../lib/empresaLegacyRedirects.js';

describe('empresaLegacyRedirects', () => {
  it('redireciona abas removidas de /empresa', () => {
    expect(resolveEmpresaLegacyTabRedirect('tarefas')).toBe('/automacoes?tab=processos');
    expect(resolveEmpresaLegacyTabRedirect('vendas')).toBe('/loja?tab=vendas&config=1');
    expect(resolveEmpresaLegacyTabRedirect('estoque')).toBe('/loja?tab=estoque');
    expect(resolveEmpresaLegacyTabRedirect('automacoes')).toBe('/automacoes?tab=configuracoes');
  });

  it('retorna null para abas atuais', () => {
    expect(resolveEmpresaLegacyTabRedirect('estudio')).toBeNull();
    expect(resolveEmpresaLegacyTabRedirect('financeiro')).toBeNull();
    expect(resolveEmpresaLegacyTabRedirect('')).toBeNull();
  });
});
