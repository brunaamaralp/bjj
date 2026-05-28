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

const ADJUSTMENT_TYPE = 'adjustment';

function adjustmentReferenciaId(quantityChange) {
  const n = Number(quantityChange);
  const sign = Number.isFinite(n) && n < 0 ? 'out' : 'in';
  return `${ADJUSTMENT_TYPE}:${sign}`;
}

function adjustmentReferenciaSign(referencia_id) {
  const ref = String(referencia_id || '');
  if (ref.endsWith(':out')) return -1;
  if (ref.endsWith(':in')) return 1;
  return 0;
}

export function resolveSignedStockMoveQuantity(doc) {
  const tipo = String(doc?.tipo || '').toLowerCase();
  const raw = Number(doc?.quantidade);
  const q = Number.isFinite(raw) ? raw : 0;
  if (tipo === 'ajuste') {
    const sign = adjustmentReferenciaSign(doc?.referencia_id);
    const abs = Math.abs(q);
    if (sign < 0) return -abs;
    if (sign > 0) return abs;
    if (q < 0) return q;
    return q;
  }
  return quantityDeltaForMoveType(tipo, q);
}

export function normalizeStockMoveQuantidadeForWrite(tipo, quantidade, referencia_id) {
  const tipoL = String(tipo || '').toLowerCase();
  const q = Number(quantidade);
  if (!Number.isFinite(q) || q === 0) {
    return { quantidade: 0, referencia_id: referencia_id ?? null };
  }
  if (tipoL === 'ajuste') {
    const absQty = Math.abs(Math.trunc(q));
    const ref = String(referencia_id || '').startsWith(ADJUSTMENT_TYPE)
      ? String(referencia_id)
      : adjustmentReferenciaId(q);
    return { quantidade: absQty, referencia_id: ref };
  }
  return {
    quantidade: Math.abs(Math.trunc(q)),
    referencia_id: referencia_id ?? null,
  };
}

export function itemDisplayName(item) {
  return String(item?.nome || item?.name || item?.descricao || item?.$id || '').trim() || 'Item';
}
