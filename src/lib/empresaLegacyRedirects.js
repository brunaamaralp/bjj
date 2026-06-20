/** Abas removidas de /empresa — destinos atuais. */
export const EMPRESA_LEGACY_TAB_REDIRECTS = {
  estoque: '/loja?tab=estoque',
  equipe: '/equipe',
  catraca: '/configuracoes?tab=integracoes',
  avancado: '/conta?tab=dados',
  automacoes: '/automacoes?tab=gatilhos',
  tarefas: '/tarefas?tab=processos',
  vendas: '/loja?tab=vendas&config=1',
  contratos: '/configuracoes?tab=financeiro&section=contratos',
};

export function resolveEmpresaLegacyTabRedirect(tab) {
  const key = String(tab || '').trim().toLowerCase();
  return EMPRESA_LEGACY_TAB_REDIRECTS[key] || null;
}
