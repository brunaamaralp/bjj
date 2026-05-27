import { describe, it, expect } from 'vitest';
import { classifyImportRow, importProductDedupKey, dedupeImportPreviewRows } from '../lib/productImport.js';

describe('classifyImportRow', () => {
  it('marks row ready without categoria when nome and price exist', () => {
    expect(
      classifyImportRow({
        nome: 'Kimono',
        categoria: '',
        sale_price: 199,
      })
    ).toBe('ready');
  });

  it('marks row incomplete only when price is missing', () => {
    expect(
      classifyImportRow({
        nome: 'Kimono',
        categoria: 'Vestuário',
        sale_price: null,
      })
    ).toBe('incomplete');
  });
});

describe('importProductDedupKey', () => {
  it('prefers sku when present', () => {
    expect(importProductDedupKey({ sku: 'ABC', nome: 'X', Tamanho: 'M' })).toBe('sku:abc');
  });

  it('dedupeImportPreviewRows marks second duplicate invalid', () => {
    const rows = [
      { id: 'r0', data: { nome: 'Camisa', Tamanho: 'G', sku: '' }, status: 'ready', selected: true },
      { id: 'r1', data: { nome: 'Camisa', Tamanho: 'G', sku: '' }, status: 'ready', selected: true },
    ];
    const out = dedupeImportPreviewRows(rows);
    expect(out[0].selected).toBe(true);
    expect(out[1].duplicateInFile).toBe(true);
    expect(out[1].selected).toBe(false);
  });

  it('uses color in nome+tamanho dedupe key', () => {
    expect(importProductDedupKey({ nome: 'Camisa', Tamanho: 'G', color: 'Azul', sku: '' })).toBe(
      'nome:camisa|tam:g|color:azul'
    );
    expect(importProductDedupKey({ nome: 'Camisa', Tamanho: 'G', color: '', sku: '' })).toBe('nome:camisa|tam:g|color:');
  });
});
