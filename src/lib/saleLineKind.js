/**
 * line_kind em vendas: sale vs rental — validação e patches de estoque.
 */
import { resolveCurrentQuantity } from './stockInventory.js';
import {
  hasDualPoolFields,
  normalizeProductType,
  rentalAvailable,
  rentalOut,
  saleQuantity,
  syncCurrentQuantityFromPools,
} from './dualStockPools.js';

export const LINE_KINDS = {
  SALE: 'sale',
  RENTAL: 'rental',
};

/** @returns {'sale'|'rental'} */
export function normalizeLineKind(raw) {
  const k = String(raw || '').trim().toLowerCase();
  return k === 'rental' || k === 'aluguel' ? LINE_KINDS.RENTAL : LINE_KINDS.SALE;
}

export function financeCategoryKeyForLineKind(lineKind) {
  return normalizeLineKind(lineKind) === LINE_KINDS.RENTAL ? 'ALUGUEL_RECEITA' : 'VENDA_PRODUTO';
}

export function stockMoveTipoForLineKind(lineKind) {
  return normalizeLineKind(lineKind) === LINE_KINDS.RENTAL ? 'saida_aluguel' : 'saida_venda';
}

export function stockMoveMotivoForLineKind(lineKind) {
  return normalizeLineKind(lineKind) === LINE_KINDS.RENTAL ? 'aluguel' : 'venda';
}

export function movementKindForLineKind(lineKind) {
  return normalizeLineKind(lineKind) === LINE_KINDS.RENTAL ? 'rental' : 'sale';
}

export function cancelStockMoveTipoForLineKind(lineKind) {
  return normalizeLineKind(lineKind) === LINE_KINDS.RENTAL ? 'devolucao' : 'reversao_venda';
}

/**
 * @param {string} parentType
 * @param {'sale'|'rental'} lineKind
 */
export function validateLineKindForParent(parentType, lineKind) {
  const kind = normalizeLineKind(lineKind);
  const pt = normalizeProductType(parentType);
  if (kind === LINE_KINDS.RENTAL && pt === 'sale') {
    return { ok: false, error: 'rental_not_allowed_for_product_type' };
  }
  if (kind === LINE_KINDS.SALE && pt === 'rental') {
    return { ok: false, error: 'sale_not_allowed_for_product_type' };
  }
  return { ok: true };
}

/**
 * Quantidade disponível para a operação.
 * @param {object} item documento variante/estoque
 * @param {'sale'|'rental'} lineKind
 * @param {string} [parentType]
 */
export function availableQuantityForLineKind(item, lineKind, parentType = 'sale') {
  const kind = normalizeLineKind(lineKind);
  if (hasDualPoolFields(item)) {
    return kind === LINE_KINDS.RENTAL ? rentalAvailable(item) : saleQuantity(item);
  }
  const legacyQty = resolveCurrentQuantity(item);
  const pt = normalizeProductType(parentType || item?.type);
  if (kind === LINE_KINDS.RENTAL) {
    return pt === 'rental' || pt === 'both' ? legacyQty : 0;
  }
  return pt === 'rental' ? 0 : legacyQty;
}

/** Snapshot para rollback em falha parcial. */
export function stockSnapshotForRollback(item) {
  if (hasDualPoolFields(item)) {
    const sale = saleQuantity(item);
    const avail = rentalAvailable(item);
    const out = rentalOut(item);
    return {
      dual: true,
      sale_quantity: sale,
      rental_available: avail,
      rental_out: out,
      current_quantity: sale + avail,
    };
  }
  return {
    dual: false,
    current_quantity: resolveCurrentQuantity(item),
  };
}

export function patchFromStockSnapshot(snap) {
  if (!snap) return {};
  if (snap.dual) {
    return {
      sale_quantity: snap.sale_quantity,
      rental_available: snap.rental_available,
      rental_out: snap.rental_out,
      current_quantity: snap.current_quantity,
    };
  }
  return { current_quantity: snap.current_quantity };
}

/**
 * Patch Appwrite após baixa de estoque na venda.
 * @param {object} item
 * @param {number} quantity
 * @param {'sale'|'rental'} lineKind
 */
export function buildSaleStockPatch(item, quantity, lineKind) {
  const q = Math.max(0, Math.trunc(Number(quantity) || 0));
  const kind = normalizeLineKind(lineKind);

  if (hasDualPoolFields(item)) {
    const sale = saleQuantity(item);
    const avail = rentalAvailable(item);
    const out = rentalOut(item);
    if (kind === LINE_KINDS.RENTAL) {
      const nextAvail = Math.max(0, avail - q);
      const nextOut = out + q;
      return {
        sale_quantity: sale,
        rental_available: nextAvail,
        rental_out: nextOut,
        current_quantity: sale + nextAvail,
      };
    }
    const nextSale = Math.max(0, sale - q);
    return {
      ...syncCurrentQuantityFromPools({
        sale_quantity: nextSale,
        rental_available: avail,
      }),
      rental_out: out,
    };
  }

  const prev = resolveCurrentQuantity(item);
  return { current_quantity: Math.max(0, prev - q) };
}

/** Reverte estoque ao cancelar venda. */
export function buildCancelStockPatch(item, quantity, lineKind) {
  const q = Math.max(0, Math.trunc(Number(quantity) || 0));
  const kind = normalizeLineKind(lineKind);

  if (hasDualPoolFields(item)) {
    const sale = saleQuantity(item);
    const avail = rentalAvailable(item);
    const out = rentalOut(item);
    if (kind === LINE_KINDS.RENTAL) {
      const nextAvail = avail + q;
      const nextOut = Math.max(0, out - q);
      return {
        sale_quantity: sale,
        rental_available: nextAvail,
        rental_out: nextOut,
        current_quantity: sale + nextAvail,
      };
    }
    return {
      ...syncCurrentQuantityFromPools({
        sale_quantity: sale + q,
        rental_available: avail,
      }),
      rental_out: out,
    };
  }

  const prev = resolveCurrentQuantity(item);
  return { current_quantity: prev + q };
}

/**
 * Preço sugerido por line_kind.
 * @param {object} parent produto pai mapeado
 * @param {'sale'|'rental'} lineKind
 */
export function suggestUnitPriceForLineKind(parent, lineKind) {
  const kind = normalizeLineKind(lineKind);
  if (kind === LINE_KINDS.RENTAL) {
    const rental = Number(parent?.rental_price);
    if (Number.isFinite(rental) && rental > 0) return rental;
    return null;
  }
  const sale = Number(parent?.sale_price);
  if (Number.isFinite(sale) && sale > 0) return sale;
  return null;
}

/** Divide pagamentos proporcionalmente ao gross de cada grupo. */
export function splitPagamentosByGrossShares(pagamentosNorm, shares) {
  const groups = (shares || []).filter((g) => g.gross > 0.009);
  const totalGross = groups.reduce((s, g) => s + g.gross, 0);
  if (!totalGross || !groups.length) return new Map();

  const out = new Map();
  let allocated = 0;
  for (let i = 0; i < groups.length; i += 1) {
    const g = groups[i];
    const isLast = i === groups.length - 1;
    const share = isLast ? 1 - allocated : g.gross / totalGross;
    if (!isLast) allocated += share;

    const scaled = (pagamentosNorm || []).map((p) => ({
      forma: p.forma,
      valor: Math.round(Number(p.valor || 0) * share * 100) / 100,
      troco: Math.round(Number(p.troco || 0) * share * 100) / 100,
      forma_troco: p.forma_troco,
    }));
    out.set(g.key, scaled);
  }
  return out;
}
