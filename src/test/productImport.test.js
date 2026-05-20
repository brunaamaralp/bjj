import { describe, it, expect } from 'vitest';
import { classifyImportRow } from '../lib/productImport.js';

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
