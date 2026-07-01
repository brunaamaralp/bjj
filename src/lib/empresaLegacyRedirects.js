/** Abas removidas de /empresa — destinos atuais. */
export const EMPRESA_LEGACY_TAB_REDIRECTS = {
  estoque: '/loja?tab=estoque',
  equipe: '/equipe',
  catraca: '/integracoes?tab=catraca',
  avancado: '/conta?tab=dados',
  automacoes: '/automacoes?tab=gatilhos',
  tarefas: '/tarefas?tab=processos',
  vendas: '/loja?tab=vendas&config=1',
  contratos: '/empresa?tab=financeiro&section=contratos',
};

/** Seções removidas de Minha Academia → Financeiro. */
export const EMPRESA_LEGACY_FINANCE_SECTION_REDIRECTS = {
  pagbank: '/integracoes?tab=pagbank',
};

export function resolveEmpresaLegacyTabRedirect(tab) {
  const key = String(tab || '').trim().toLowerCase();
  return EMPRESA_LEGACY_TAB_REDIRECTS[key] || null;
}

export function resolveEmpresaLegacyFinanceSectionRedirect(section) {
  const key = String(section || '').trim().toLowerCase();
  return EMPRESA_LEGACY_FINANCE_SECTION_REDIRECTS[key] || null;
}
