/** Abas removidas de /empresa — destinos atuais. */
export const EMPRESA_LEGACY_TAB_REDIRECTS = {
  estoque: '/loja?tab=estoque',
  equipe: '/equipe',
  catraca: '/integracoes?tab=catraca',
  avancado: '/conta?tab=dados',
  automacoes: '/automacoes?tab=gatilhos',
  tarefas: '/tarefas?tab=processos',
  vendas: '/loja?tab=vendas&config=1',
};

/** Seções removidas de Minha Academia → Financeiro. */
export const EMPRESA_LEGACY_FINANCE_SECTION_REDIRECTS = {
  pagbank: '/integracoes?tab=pagbank',
  contratos: '/empresa?tab=contratos',
};

export function resolveEmpresaLegacyTabRedirect(tab) {
  const key = String(tab || '').trim().toLowerCase();
  return EMPRESA_LEGACY_TAB_REDIRECTS[key] || null;
}

/**
 * @param {string|null|undefined} section
 * @param {URLSearchParams|null|undefined} [searchParams] — preserva `new`/`edit` em contratos
 */
export function resolveEmpresaLegacyFinanceSectionRedirect(section, searchParams) {
  const key = String(section || '').trim().toLowerCase();
  const base = EMPRESA_LEGACY_FINANCE_SECTION_REDIRECTS[key];
  if (!base) return null;
  if (key !== 'contratos') return base;

  const next = new URLSearchParams();
  next.set('tab', 'contratos');
  if (searchParams) {
    const n = searchParams.get('new');
    const e = searchParams.get('edit');
    if (n) next.set('new', n);
    if (e) next.set('edit', e);
  }
  return `/empresa?${next.toString()}`;
}
