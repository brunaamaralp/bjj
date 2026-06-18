import { describe, expect, it } from 'vitest';
import { PRODUCT_VARIANTS_COL } from '../../../lib/server/productCatalogDb.js';
import {
  descriptionFromSnapshotJson,
  descriptionFromSnapshotLines,
  formatSaleDescriptionPart,
  stockItemLabelFromResolved,
} from '../../../lib/server/saleDescription.js';

describe('saleDescription', () => {
  describe('formatSaleDescriptionPart', () => {
    it('repete nome quando quantidade é 1', () => {
      expect(formatSaleDescriptionPart('Kimono Atama · M', 1)).toBe('Kimono Atama · M');
    });

    it('agrega quantidade acima de 1', () => {
      expect(formatSaleDescriptionPart('Kimono Atama · M', 3)).toBe('Kimono Atama · M x3');
    });

    it('ignora label vazio', () => {
      expect(formatSaleDescriptionPart('', 2)).toBe('');
    });
  });

  describe('descriptionFromSnapshotLines', () => {
    it('monta lista a partir do snapshot da venda', () => {
      expect(
        descriptionFromSnapshotLines([
          { label: 'Kimono Atama · M', quantidade: 1 },
          { label: 'Faixa Branca', quantidade: 2 },
        ])
      ).toBe('Kimono Atama · M, Faixa Branca x2');
    });
  });

  describe('descriptionFromSnapshotJson', () => {
    it('parseia itens_snapshot_json', () => {
      const json = JSON.stringify([
        { label: 'Rashguard · G', quantidade: 1 },
        { label: 'Boné', quantidade: 1 },
      ]);
      expect(descriptionFromSnapshotJson(json)).toBe('Rashguard · G, Boné');
    });

    it('retorna vazio para JSON inválido', () => {
      expect(descriptionFromSnapshotJson('{bad')).toBe('');
    });
  });

  describe('stockItemLabelFromResolved', () => {
    it('usa nome do pai para item legado', () => {
      expect(
        stockItemLabelFromResolved({
          collection: 'stock_items',
          doc: { nome: 'Kimono' },
          parent: null,
        })
      ).toBe('Kimono');
    });

    it('inclui variante no rótulo', () => {
      expect(
        stockItemLabelFromResolved({
          collection: PRODUCT_VARIANTS_COL,
          doc: { size: 'M', color: 'Azul' },
          parent: { nome: 'Kimono Atama' },
        })
      ).toBe('Kimono Atama · M · Azul');
    });
  });
});
