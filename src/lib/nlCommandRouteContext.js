/**
 * Contexto NL padrão conforme a rota (sem overrides de página).
 * @param {string} pathname
 * @returns {'financeiro'|'funil'|'perfil'|'vendas'}
 */
export function resolveNlContext(pathname) {
  const p = String(pathname || '').trim().toLowerCase();
  if (!p || p === '/') return 'perfil';
  if (p.startsWith('/pipeline') || p.startsWith('/funil')) return 'funil';
  if (
    p.startsWith('/financeiro') ||
    p.startsWith('/caixa') ||
    p.startsWith('/mensalidades')
  ) {
    return 'financeiro';
  }
  if (p.startsWith('/sales') || p.startsWith('/vendas') || p.startsWith('/loja')) return 'vendas';
  if (p.startsWith('/student/') || p.startsWith('/lead/') || p.startsWith('/aluno/')) {
    return 'perfil';
  }
  return 'perfil';
}
