import { describe, expect, it, vi, beforeEach } from 'vitest';
import { stockEntryCorrectionError } from '../lib/stockEntryCorrection.js';

describe('stockEntryCorrectionError', () => {
  it('traduz código forbidden', () => {
    expect(stockEntryCorrectionError('forbidden')).toContain('titular ou administrador');
  });

  it('anexa aviso quando correção parcial', () => {
    expect(stockEntryCorrectionError('no_stock', true)).toContain('Parte da correção');
  });
});

describe('buildStockPurchaseFinancePayload origin', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('mantém origin no payload de reposição', async () => {
    const { buildStockPurchaseFinancePayload } = await import('../../lib/server/inventoryMoveHandler.js');
    const payload = buildStockPurchaseFinancePayload({
      academyId: 'a1',
      purchasePrice: 50,
      itemName: 'Kimono',
      quantity: 2,
      stockMoveId: 'move-99',
    });
    expect(payload.origin_type).toBe('stock_entry');
    expect(payload.origin_id).toBe('move-99');
  });
});
