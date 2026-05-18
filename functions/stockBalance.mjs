/**
 * Saldo de estoque — fonte única: current_quantity.
 * DEPRECATED (somente leitura de fallback): quantidade_total, quantidade_vendida, quantidade_alugada
 */

export function legacyAvailable(item) {
  const total = Number(item?.quantidade_total ?? 0);
  const vendida = Number(item?.quantidade_vendida ?? 0);
  const alugada = Number(item?.quantidade_alugada ?? 0);
  return total - vendida - alugada;
}

/** Saldo efetivo: current_quantity quando definido; senão fallback legado. */
export function resolveCurrentQuantity(item) {
  if (item == null) return 0;
  const raw = item.current_quantity;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return legacyAvailable(item);
}

export function quantityDeltaForMoveType(tipo, quantidade) {
  const q = Number(quantidade);
  if (!Number.isFinite(q) || q === 0) return 0;
  switch (String(tipo || '').toLowerCase()) {
    case 'entrada':
    case 'devolucao':
    case 'reversao_venda':
      return q > 0 ? q : 0;
    case 'ajuste':
      return q;
    case 'saida_venda':
    case 'saida_aluguel':
      return q > 0 ? -q : 0;
    default:
      return 0;
  }
}

export function itemDisplayName(item) {
  return String(item?.nome || item?.name || item?.descricao || item?.$id || '').trim() || 'Item';
}
