import { normalizeProductType, PRODUCT_TYPES } from './dualStockPools.js';

/** Escopo do catálogo no hub Loja (`?tab=produtos` vs `?tab=aluguel`). */
export const LOJA_PRODUCT_SCOPES = {
  PRODUCTS: 'produtos',
  RENTAL: 'aluguel',
};

const RENTAL_TAB_TYPES = new Set([PRODUCT_TYPES.RENTAL, PRODUCT_TYPES.BOTH]);
const PRODUCTS_TAB_TYPES = new Set([PRODUCT_TYPES.SALE, PRODUCT_TYPES.SUPPLY, PRODUCT_TYPES.BOTH]);

/** Produto pai visível na aba indicada. */
export function parentMatchesLojaCatalogScope(parent, scope = LOJA_PRODUCT_SCOPES.PRODUCTS) {
  const type = normalizeProductType(parent?.type);
  if (scope === LOJA_PRODUCT_SCOPES.RENTAL) return RENTAL_TAB_TYPES.has(type);
  return PRODUCTS_TAB_TYPES.has(type);
}

/** Tipo padrão ao criar produto em cada aba. */
export function defaultProductTypeForLojaScope(scope = LOJA_PRODUCT_SCOPES.PRODUCTS) {
  return scope === LOJA_PRODUCT_SCOPES.RENTAL ? PRODUCT_TYPES.RENTAL : PRODUCT_TYPES.SALE;
}

export function isRentalLojaCatalogScope(scope) {
  return scope === LOJA_PRODUCT_SCOPES.RENTAL;
}

const PRODUCT_TYPE_OPTIONS = [
  { value: 'sale', label: 'Venda' },
  { value: 'both', label: 'Venda e aluguel' },
  { value: 'supply', label: 'Insumo' },
  { value: 'rental', label: 'Aluguel' },
];

/** Tipos exibidos no select do modal por aba. */
export function allowedProductTypesForLojaScope(scope = LOJA_PRODUCT_SCOPES.PRODUCTS) {
  if (scope === LOJA_PRODUCT_SCOPES.RENTAL) {
    return PRODUCT_TYPE_OPTIONS.filter((o) => o.value === 'rental' || o.value === 'both');
  }
  return PRODUCT_TYPE_OPTIONS.filter((o) => o.value !== 'rental');
}

export function otherLojaCatalogTab(scope = LOJA_PRODUCT_SCOPES.PRODUCTS) {
  return scope === LOJA_PRODUCT_SCOPES.RENTAL
    ? LOJA_PRODUCT_SCOPES.PRODUCTS
    : LOJA_PRODUCT_SCOPES.RENTAL;
}

export function filterParentsByLojaCatalogScope(parents, scope = LOJA_PRODUCT_SCOPES.PRODUCTS) {
  return (parents || []).filter((p) => parentMatchesLojaCatalogScope(p, scope));
}

/** Defaults de importação conforme aba (tipo + preço de aluguel). */
export function applyLojaImportRowDefaults(row, defaultProductType) {
  const type = String(defaultProductType || '').trim().toLowerCase();
  if (!type || type === 'sale') return row;

  const out = { ...row, type };
  const price = out.rental_price ?? out.sale_price;
  if (type === 'rental' || type === 'both') {
    if (price != null && Number.isFinite(Number(price))) {
      out.rental_price = Number(price);
    }
  }
  if (type === 'rental') {
    out.is_for_sale = true;
  }
  return out;
}
