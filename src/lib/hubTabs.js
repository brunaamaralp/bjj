/** Resolve aba de hub via ?tab= com fallback seguro. */
export function resolveHubTab(raw, allowedIds, fallback) {
  const id = String(raw || '').trim().toLowerCase();
  const set = allowedIds instanceof Set ? allowedIds : new Set(allowedIds);
  return set.has(id) ? id : fallback;
}

/** Mapeia rotas legadas de /finance para abas do Caixa. */
export function financeLegacyTabToCaixa(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'lancamentos') return 'razao';
  if (t === 'relatorios') return 'dre';
  if (t === 'plano') return 'plano';
  return 'plano';
}

/** Mapeia estado interno antigo do Caixa para slugs novos. */
export function caixaLegacyTabToSlug(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'transactions') return 'movimentacoes';
  if (t === 'closing') return 'fechamento';
  if (t === 'contabilidade') return 'plano';
  return t;
}
