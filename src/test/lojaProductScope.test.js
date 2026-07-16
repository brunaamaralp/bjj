import { describe, expect, it } from 'vitest';
import { PRODUCT_TYPES } from '../lib/dualStockPools.js';
import {
  defaultProductTypeForLojaScope,
  LOJA_PRODUCT_SCOPES,
  parentMatchesLojaCatalogScope,
} from '../lib/lojaProductScope.js';

describe('lojaProductScope', () => {
  it('parentMatchesLojaCatalogScope — produtos exclui rental puro', () => {
    expect(parentMatchesLojaCatalogScope({ type: 'sale' }, LOJA_PRODUCT_SCOPES.PRODUCTS)).toBe(true);
    expect(parentMatchesLojaCatalogScope({ type: 'supply' }, LOJA_PRODUCT_SCOPES.PRODUCTS)).toBe(true);
    expect(parentMatchesLojaCatalogScope({ type: 'both' }, LOJA_PRODUCT_SCOPES.PRODUCTS)).toBe(true);
    expect(parentMatchesLojaCatalogScope({ type: 'rental' }, LOJA_PRODUCT_SCOPES.PRODUCTS)).toBe(false);
  });

  it('parentMatchesLojaCatalogScope — aluguel inclui rental e both', () => {
    expect(parentMatchesLojaCatalogScope({ type: 'rental' }, LOJA_PRODUCT_SCOPES.RENTAL)).toBe(true);
    expect(parentMatchesLojaCatalogScope({ type: 'both' }, LOJA_PRODUCT_SCOPES.RENTAL)).toBe(true);
    expect(parentMatchesLojaCatalogScope({ type: 'sale' }, LOJA_PRODUCT_SCOPES.RENTAL)).toBe(false);
    expect(parentMatchesLojaCatalogScope({ type: 'supply' }, LOJA_PRODUCT_SCOPES.RENTAL)).toBe(false);
  });

  it('defaultProductTypeForLojaScope', () => {
    expect(defaultProductTypeForLojaScope(LOJA_PRODUCT_SCOPES.PRODUCTS)).toBe(PRODUCT_TYPES.SALE);
    expect(defaultProductTypeForLojaScope(LOJA_PRODUCT_SCOPES.RENTAL)).toBe(PRODUCT_TYPES.RENTAL);
  });
});
