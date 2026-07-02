import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDocumentResilient: vi.fn(),
  applyAccountingSideEffectsAutoServer: vi.fn(),
}));

vi.mock('../../lib/server/appwriteSchemaResilient.js', () => ({
  createDocumentResilient: mocks.createDocumentResilient,
}));

vi.mock('../../lib/server/financeJournalServer.js', () => ({
  applyAccountingSideEffectsAutoServer: mocks.applyAccountingSideEffectsAutoServer,
}));

describe('saleCmv ledger_regime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'tx-col';
    mocks.createDocumentResilient.mockResolvedValue({ $id: 'tx-cmv-1', status: 'settled' });
  });

  it('recordSaleItemCmv creates financial tx with ledger_regime accrual', async () => {
    const { recordSaleItemCmv } = await import('../../lib/server/saleCmv.js');
    const databases = {
      updateDocument: vi.fn().mockResolvedValue({}),
    };

    await recordSaleItemCmv(databases, {
      dbId: 'db',
      saleItemsCol: 'sale-items',
      saleItemId: 'item-1',
      saleItemPatch: {},
      stockDoc: { average_cost: 10 },
      variantLabel: 'Kimono',
      quantity: 2,
      academyId: 'ac-1',
      vendaId: 'sale-1',
      settledAt: '2026-06-10T12:00:00.000Z',
    });

    expect(mocks.createDocumentResilient).toHaveBeenCalled();
    const payload = mocks.createDocumentResilient.mock.calls[0][4];
    expect(payload.ledger_regime).toBe('accrual');
    expect(payload.origin_type).toBe('sale_cmv');
  });
});
