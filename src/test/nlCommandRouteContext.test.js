import { describe, it, expect } from 'vitest';
import { resolveNlContext } from '../lib/nlCommandRouteContext.js';

describe('resolveNlContext', () => {
  it('maps finance routes', () => {
    expect(resolveNlContext('/financeiro')).toBe('financeiro');
    expect(resolveNlContext('/caixa')).toBe('financeiro');
    expect(resolveNlContext('/mensalidades')).toBe('financeiro');
  });

  it('maps funnel and sales', () => {
    expect(resolveNlContext('/pipeline')).toBe('funil');
    expect(resolveNlContext('/vendas')).toBe('vendas');
  });

  it('maps profiles and default', () => {
    expect(resolveNlContext('/student/abc')).toBe('perfil');
    expect(resolveNlContext('/lead/xyz')).toBe('perfil');
    expect(resolveNlContext('/')).toBe('perfil');
  });
});
