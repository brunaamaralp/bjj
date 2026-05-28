const SALES_LEAF_TABS = new Set(['new', 'history']);

function normalizeLeafId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return id === 'historico' ? 'history' : id;
}

/** Aba interna de Vendas (Nova venda / Histórico) via ?subtab=; aceita legado ?tab=new|history. */
export function resolveSalesSubtab(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams);
  const fromSub = normalizeLeafId(params.get('subtab'));
  if (SALES_LEAF_TABS.has(fromSub)) return fromSub;
  const fromTab = normalizeLeafId(params.get('tab'));
  if (SALES_LEAF_TABS.has(fromTab)) return fromTab;
  return 'new';
}

export function isLegacySalesLeafTab(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams);
  return SALES_LEAF_TABS.has(normalizeLeafId(params.get('tab')));
}

/** Mantém ?tab=vendas no hub Loja e grava a subaba em ?subtab=. */
export function lojaVendasTabParams(subtab, prev) {
  const next = new URLSearchParams(prev);
  next.set('tab', 'vendas');
  next.set('subtab', subtab);
  return next;
}

export function salesSubtabNeedsNormalize(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams);
  const resolved = resolveSalesSubtab(params);
  const hubTab = String(params.get('tab') || '').trim().toLowerCase();
  const currentSub = normalizeLeafId(params.get('subtab'));
  const hubOk = hubTab === 'vendas';
  const subOk = currentSub === resolved;
  return !hubOk || !subOk || isLegacySalesLeafTab(params);
}
