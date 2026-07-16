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
