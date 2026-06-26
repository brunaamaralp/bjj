const SALES_LEAF_TABS = new Set(['new', 'history']);

/** Sub-abas visíveis em Loja → Vendas (rótulos de produto; IDs estáveis na URL). */
export const SALES_SUBTABS = [
  { id: 'new', label: 'Nova venda' },
  { id: 'history', label: 'Todas as vendas' },
];

export function salesSubtabLabel(id) {
  return SALES_SUBTABS.find((t) => t.id === id)?.label || String(id || '');
}

function normalizeLeafId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return id === 'historico' ? 'history' : id;
}

/** Aba interna de Vendas (Nova venda / Todas as vendas) via ?subtab=; aceita legado ?tab=new|history. */
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

export const SALES_PDV_STORAGE_KEY = 'sales:pdvMode:v1';

export function resolveSalesPdvMode(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams);
  return String(params.get('pdv') || '').trim() === '1';
}

export function lojaVendasPdvParams(enabled, prev) {
  const next = new URLSearchParams(prev);
  next.set('tab', 'vendas');
  if (!next.get('subtab')) next.set('subtab', 'new');
  if (enabled) next.set('pdv', '1');
  else next.delete('pdv');
  return next;
}

export function readSalesPdvPreference() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SALES_PDV_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSalesPdvPreference(enabled) {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) window.localStorage.setItem(SALES_PDV_STORAGE_KEY, '1');
    else window.localStorage.removeItem(SALES_PDV_STORAGE_KEY);
  } catch {
    void 0;
  }
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
