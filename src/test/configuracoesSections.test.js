import { describe, expect, it } from 'vitest';
import {
  CONFIGURACOES_SECTIONS,
  CONFIGURACOES_ITEMS,
  CONFIGURACOES_DEFAULT_SECTION,
  isConfiguracoesSection,
  resolveConfiguracoesNavState,
} from '../lib/configuracoesSections.js';

describe('configuracoesSections', () => {
  it('usa academia como fallback canônico', () => {
    expect(CONFIGURACOES_DEFAULT_SECTION).toBe(CONFIGURACOES_SECTIONS.ACADEMIA);
    expect(resolveConfiguracoesNavState('invalido').section).toBe('academia');
  });

  it('expõe as famílias principais da nova IA', () => {
    expect(CONFIGURACOES_ITEMS.map((item) => item.id)).toEqual([
      'academia',
      'crm',
      'alunos-aulas',
      'integracoes',
      'financeiro',
    ]);
  });

  it('aceita tabs válidas e rejeita tabs removidas', () => {
    expect(isConfiguracoesSection('crm')).toBe('crm');
    expect(isConfiguracoesSection('estudio')).toBeNull();
  });
});
