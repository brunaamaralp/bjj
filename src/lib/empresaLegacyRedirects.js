/** Abas removidas de /empresa — destinos atuais. */
export const EMPRESA_LEGACY_TAB_REDIRECTS = {
  estoque: '/loja?tab=estoque',
  equipe: '/equipe',
  catraca: '/integracoes?tab=catraca',
  avancado: '/conta?tab=dados',
  automacoes: '/automacoes?tab=configuracoes',
};

export function resolveEmpresaLegacyTabRedirect(tab) {
  const key = String(tab || '').trim().toLowerCase();
  return EMPRESA_LEGACY_TAB_REDIRECTS[key] || null;
}
