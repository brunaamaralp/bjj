/**
 * Estoque dual por variante: venda vs aluguel (disponível + emprestado).
 * @see docs/superpowers/specs/2026-06-16-venda-aluguel-estoque-dual-TECH.md
 */

export const PRODUCT_TYPES = {
  SALE: 'sale',
  RENTAL: 'rental',
  BOTH: 'both',
  SUPPLY: 'supply',
};

function finiteNonNeg(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.trunc(x);
}

/** @param {string|undefined|null} raw */
export function normalizeProductType(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'supply' || t === 'insumo') return PRODUCT_TYPES.SUPPLY;
  if (t === 'rental' || t === 'aluguel') return PRODUCT_TYPES.RENTAL;
  if (t === 'both' || t === 'venda_e_aluguel') return PRODUCT_TYPES.BOTH;
  return PRODUCT_TYPES.SALE;
}

export function productTypeShowsSalePools(type) {
  const t = normalizeProductType(type);
  return t === PRODUCT_TYPES.SALE || t === PRODUCT_TYPES.BOTH;
}

export function productTypeShowsRentalPools(type) {
  const t = normalizeProductType(type);
  return t === PRODUCT_TYPES.RENTAL || t === PRODUCT_TYPES.BOTH;
}

export function hasDualPoolFields(item) {
  if (!item || typeof item !== 'object') return false;
  return (
    item.sale_quantity !== undefined &&
    item.sale_quantity !== null &&
    item.sale_quantity !== ''
  );
}

export function saleQuantity(item) {
  if (hasDualPoolFields(item)) return finiteNonNeg(item.sale_quantity);
  return 0;
}

export function rentalAvailable(item) {
  if (hasDualPoolFields(item)) return finiteNonNeg(item.rental_available);
  return 0;
}

export function rentalOut(item) {
  if (hasDualPoolFields(item)) return finiteNonNeg(item.rental_out);
  return 0;
}

/** Saldo disponível legado (venda + aluguel no armário). */
export function availableFromPools(item) {
  if (hasDualPoolFields(item)) return saleQuantity(item) + rentalAvailable(item);
  return null;
}

/** Total físico da variante. */
export function totalPhysicalQuantity(item) {
  if (hasDualPoolFields(item)) {
    return saleQuantity(item) + rentalAvailable(item) + rentalOut(item);
  }
  return null;
}

/**
 * Quantidade disponível para operação por tipo de linha.
 * @param {'sale'|'rental'} kind
 */
export function availableQuantityForKind(item, kind) {
  if (kind === 'rental') return rentalAvailable(item);
  return saleQuantity(item);
}

/**
 * Sincroniza current_quantity com a soma dos pools disponíveis (compat legado).
 */
export function syncCurrentQuantityFromPools({ sale_quantity = 0, rental_available = 0 }) {
  const sale = finiteNonNeg(sale_quantity);
  const rental = finiteNonNeg(rental_available);
  return {
    sale_quantity: sale,
    rental_available: rental,
    current_quantity: sale + rental,
  };
}

/**
 * Monta campos de pool para create/update de variante.
 * @param {object} opts
 * @param {string} opts.parentType
 * @param {number} [opts.initial_quantity] legado — mapeia para o pool único do tipo
 * @param {number} [opts.initial_sale_quantity]
 * @param {number} [opts.initial_rental_quantity]
 * @param {number} [opts.sale_quantity] valor absoluto (edição)
 * @param {number} [opts.rental_available]
 * @param {number} [opts.rental_out]
 */
export function buildVariantPoolFields({
  parentType,
  initial_quantity = 0,
  initial_sale_quantity,
  initial_rental_quantity,
  sale_quantity,
  rental_available,
  rental_out,
} = {}) {
  const type = normalizeProductType(parentType);
  const legacyInit = finiteNonNeg(initial_quantity);

  let sale = sale_quantity != null ? finiteNonNeg(sale_quantity) : 0;
  let rentalAvail = rental_available != null ? finiteNonNeg(rental_available) : 0;
  let rentalLoaned = rental_out != null ? finiteNonNeg(rental_out) : 0;

  if (sale_quantity == null && rental_available == null && rental_out == null) {
    const initSale =
      initial_sale_quantity != null ? finiteNonNeg(initial_sale_quantity) : legacyInit;
    const initRental =
      initial_rental_quantity != null ? finiteNonNeg(initial_rental_quantity) : legacyInit;

    if (type === PRODUCT_TYPES.SALE) {
      sale = initSale;
      rentalAvail = 0;
      rentalLoaned = 0;
    } else if (type === PRODUCT_TYPES.RENTAL) {
      sale = 0;
      rentalAvail = initRental;
      rentalLoaned = 0;
    } else if (type === PRODUCT_TYPES.BOTH) {
      sale = initial_sale_quantity != null ? finiteNonNeg(initial_sale_quantity) : 0;
      rentalAvail = initial_rental_quantity != null ? finiteNonNeg(initial_rental_quantity) : 0;
      rentalLoaned = 0;
    } else {
      sale = 0;
      rentalAvail = 0;
      rentalLoaned = 0;
    }
  }

  if (type === PRODUCT_TYPES.SALE) {
    rentalAvail = 0;
    rentalLoaned = 0;
  } else if (type === PRODUCT_TYPES.RENTAL) {
    sale = 0;
  }

  return {
    ...syncCurrentQuantityFromPools({
      sale_quantity: sale,
      rental_available: rentalAvail,
    }),
    rental_out: rentalLoaned,
  };
}

/** Texto resumido para listagens: "2 venda · 5 aluguel · 1 emprestado" */
export function formatStockPoolsSummary(item, parentType) {
  const type = normalizeProductType(parentType || item?.type);
  const parts = [];
  if (productTypeShowsSalePools(type)) {
    parts.push(`${saleQuantity(item)} venda`);
  }
  if (productTypeShowsRentalPools(type)) {
    parts.push(`${rentalAvailable(item)} aluguel`);
    const out = rentalOut(item);
    if (out > 0) parts.push(`${out} emprestado`);
  }
  if (!parts.length) return String(finiteNonNeg(item?.current_quantity ?? 0));
  return parts.join(' · ');
}

/** Agrega pools de variantes para linha pai. */
export function aggregatePoolTotals(variants, parentType) {
  const type = normalizeProductType(parentType);
  let sale = 0;
  let rentalAvail = 0;
  let rentalLoaned = 0;
  let legacyQty = 0;

  for (const v of variants || []) {
    if (hasDualPoolFields(v)) {
      sale += saleQuantity(v);
      rentalAvail += rentalAvailable(v);
      rentalLoaned += rentalOut(v);
    } else {
      legacyQty += finiteNonNeg(v?.current_quantity);
    }
  }

  const hasPools = (variants || []).some((v) => hasDualPoolFields(v));

  return {
    sale_quantity: sale,
    rental_available: rentalAvail,
    rental_out: rentalLoaned,
    total_sale_quantity: sale,
    total_rental_available: rentalAvail,
    total_rental_out: rentalLoaned,
    total_quantity: hasPools ? sale + rentalAvail + rentalLoaned : legacyQty,
    total_available: hasPools ? sale + rentalAvail : legacyQty,
  };
}
