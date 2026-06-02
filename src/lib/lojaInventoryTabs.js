const INVENTORY_LEAF_TABS = new Set(['saldo', 'movimentos']);

/** Aba interna de Estoque (Inventário / Movimentações) via ?subtab=. */
export function resolveInventorySubtab(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams);
  const raw = String(params.get('subtab') || '').trim().toLowerCase();
  return INVENTORY_LEAF_TABS.has(raw) ? raw : 'saldo';
}

/** Mantém ?tab=estoque no hub Loja e grava a subaba em ?subtab=. */
export function lojaEstoqueTabParams(subtab, prev) {
  const next = new URLSearchParams(prev);
  next.set('tab', 'estoque');
  next.set('subtab', subtab);
  return next;
}

export const INVENTORY_SUBTAB_LABELS = {
  saldo: 'Inventário',
  movimentos: 'Movimentações',
};
