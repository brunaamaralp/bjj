/**
 * Registro de redirects legados (implementação em LegacyRedirects.jsx + App.jsx).
 * Atualize este arquivo ao adicionar ou alterar rotas de compatibilidade.
 */
export const LEGACY_ROUTE_REDIRECTS = [
  {
    id: 'caixa',
    from: '/caixa',
    to: '/financeiro',
    preserveSearch: true,
    mapTab: 'financeiroLegacyTabToSlug',
  },
  {
    id: 'finance',
    from: '/finance',
    to: '/empresa',
    defaultTab: 'financeiro',
  },
  {
    id: 'contratos',
    from: '/contratos',
    to: '/alunos?tab=contratos',
    exceptTab: { tab: 'modelos', to: '/empresa?tab=financeiro&section=contratos' },
  },
  { id: 'contratos-modelos', from: '/contratos/modelos', to: '/empresa?tab=financeiro&section=contratos' },
  { id: 'templates', from: '/templates', to: '/automacoes?tab=modelos' },
  { id: 'planos', from: '/planos', to: '/conta?tab=assinatura' },
  { id: 'profile', from: '/profile', to: '/conta' },
  { id: 'vendas', from: '/vendas', to: '/loja?tab=vendas' },
  { id: 'produtos', from: '/produtos', to: '/loja?tab=produtos' },
  { id: 'estoque', from: '/estoque', to: '/loja?tab=estoque' },
  {
    id: 'mensalidades',
    from: '/mensalidades',
    to: '/financeiro',
    preserveSearch: true,
    forceTab: 'mensalidades',
  },
  {
    id: 'automacoes-agente',
    from: '/automacoes',
    queryTab: 'agente',
    to: '/agente-ia',
    note: 'Redirect em Automacoes.jsx (useEffect), não em LegacyRedirects',
  },
];
