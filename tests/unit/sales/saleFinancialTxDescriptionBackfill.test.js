import { describe, expect, it } from 'vitest';
import {
  isGenericSaleProductDescription,
  isSaleRevenueFinancialTx,
  resolveSaleFinancialTxDescriptionBackfill,
} from '../../../lib/server/saleFinancialTxDescriptionBackfill.js';

describe('saleFinancialTxDescriptionBackfill', () => {
  describe('isGenericSaleProductDescription', () => {
    it('detecta lista repetida de Produto', () => {
      expect(isGenericSaleProductDescription('Produto, Produto, Produto')).toBe(true);
    });

    it('detecta Produto com quantidade', () => {
      expect(isGenericSaleProductDescription('Produto x2, Produto')).toBe(true);
    });

    it('ignora nomes reais', () => {
      expect(isGenericSaleProductDescription('Kimono Atama · M, Faixa Branca x2')).toBe(false);
    });
  });

  describe('isSaleRevenueFinancialTx', () => {
    it('inclui type product com saleId', () => {
      expect(isSaleRevenueFinancialTx({ type: 'product', saleId: 'abc' })).toBe(true);
    });

    it('ignora CMV', () => {
      expect(
        isSaleRevenueFinancialTx({
          type: 'stock_purchase',
          saleId: 'abc',
          origin_type: 'sale_cmv',
        })
      ).toBe(false);
    });
  });

  describe('resolveSaleFinancialTxDescriptionBackfill', () => {
    it('atualiza planName genérico', () => {
      expect(
        resolveSaleFinancialTxDescriptionBackfill(
          { planName: 'Produto, Produto', note: 'Produto, Produto', type: 'product', saleId: 's1' },
          'Kimono · M, Rashguard · G'
        )
      ).toEqual({
        action: 'update',
        planName: 'Kimono · M, Rashguard · G',
        patch: {
          planName: 'Kimono · M, Rashguard · G',
          note: 'Kimono · M, Rashguard · G',
        },
      });
    });

    it('preserva note customizada', () => {
      const out = resolveSaleFinancialTxDescriptionBackfill(
        { planName: 'Produto', note: 'Obs interna', type: 'product', saleId: 's1' },
        'Kimono · M'
      );
      expect(out.action).toBe('update');
      expect(out.patch).toEqual({ planName: 'Kimono · M' });
    });

    it('ignora quando planName já é legível', () => {
      expect(
        resolveSaleFinancialTxDescriptionBackfill(
          { planName: 'Kimono · M', type: 'product', saleId: 's1' },
          'Kimono · M'
        )
      ).toEqual({
        action: 'skip',
        reason: 'planName_ok',
        planName: 'Kimono · M',
      });
    });
  });
});
