import { describe, it, expect } from 'vitest';
import { resolveEmpresaLegacyTabRedirect } from '../lib/empresaLegacyRedirects.js';

describe('empresaLegacyRedirects', () => {
  it('redireciona tarefas para processos em Tarefas', () => {
    expect(resolveEmpresaLegacyTabRedirect('tarefas')).toBe('/tarefas?tab=processos');
  });

  it('redireciona automacoes para gatilhos', () => {
    expect(resolveEmpresaLegacyTabRedirect('automacoes')).toBe('/automacoes?tab=gatilhos');
  });
});
