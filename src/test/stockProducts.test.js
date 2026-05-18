import { describe, it, expect } from 'vitest';
import {
  filterProductsClient,
  mapStockProductDoc,
  productDisplayLabel,
  parseSkuFormFields,
  resolveSkuFromForm,
  pickProductApiBody,
  PRODUCT_SKU_OTHER,
} from '../lib/stockProducts';

describe('stockProducts', () => {
  it('productDisplayLabel includes size when set', () => {
    expect(productDisplayLabel({ nome: 'Item A', Tamanho: 'M' })).toBe('Item A · M');
    expect(productDisplayLabel({ nome: 'Item B' })).toBe('Item B');
  });

  it('mapStockProductDoc derives lifecycle', () => {
    const active = mapStockProductDoc({
      $id: '1',
      nome: 'X',
      categoria: 'Cat',
      current_quantity: 5,
      is_active: true,
    });
    expect(active.lifecycle).toBe('ativo');

    const empty = mapStockProductDoc({
      $id: '2',
      nome: 'Y',
      categoria: 'Cat',
      current_quantity: 0,
      is_active: true,
    });
    expect(empty.lifecycle).toBe('sem_estoque');

    const off = mapStockProductDoc({
      $id: '3',
      nome: 'Z',
      categoria: 'Cat',
      is_active: false,
    });
    expect(off.lifecycle).toBe('inativo');
  });

  it('parseSkuFormFields and resolveSkuFromForm', () => {
    expect(parseSkuFormFields('M')).toEqual({ skuSelect: 'M', skuOther: '' });
    expect(parseSkuFormFields('custom')).toEqual({ skuSelect: PRODUCT_SKU_OTHER, skuOther: 'custom' });
    expect(resolveSkuFromForm('G', '')).toBe('G');
    expect(resolveSkuFromForm(PRODUCT_SKU_OTHER, 'XL')).toBe('XL');
  });

  it('pickProductApiBody strips item_estoque_id', () => {
    const body = pickProductApiBody({
      nome: 'X',
      categoria: 'C',
      item_estoque_id: 'evil',
    });
    expect(body.nome).toBe('X');
    expect(body.item_estoque_id).toBeUndefined();
  });

  it('filterProductsClient applies filters', () => {
    const items = [
      { nome: 'A', categoria: 'U', lifecycle: 'ativo', is_for_sale: true, Tamanho: '', sku: '', descricao: '' },
      { nome: 'B', categoria: 'V', lifecycle: 'inativo', is_for_sale: false, Tamanho: '', sku: '', descricao: '' },
    ];
    expect(filterProductsClient(items, { statusFilter: 'inativo' })).toHaveLength(1);
    expect(filterProductsClient(items, { typeFilter: 'for_sale' })).toHaveLength(1);
    expect(filterProductsClient(items, { search: 'b' })).toHaveLength(1);
  });
});
