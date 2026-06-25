import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  reverseSettledFinanceTx: vi.fn(),
  createStockPurchaseFinanceTx: vi.fn(),
  executeInventoryAdjustment: vi.fn(),
  patchStockMoveFinancialTxId: vi.fn(),
  resolveStockDocument: vi.fn(),
  recordFinancialAudit: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (k, v) => ({ k, v }),
    limit: (n) => ({ n }),
  },
}));

vi.mock('../../lib/server/financeTxReverse.js', () => ({
  reverseEligibilityError: vi.fn(() => ''),
  reverseSettledFinanceTx: mocks.reverseSettledFinanceTx,
}));

vi.mock('../../lib/server/inventoryMoveHandler.js', () => ({
  createStockPurchaseFinanceTx: mocks.createStockPurchaseFinanceTx,
  executeInventoryAdjustment: mocks.executeInventoryAdjustment,
  patchStockMoveFinancialTxId: mocks.patchStockMoveFinancialTxId,
}));

vi.mock('../../lib/server/productCatalogDb.js', () => ({
  resolveStockDocument: mocks.resolveStockDocument,
}));

vi.mock('../../lib/server/financialAuditLog.js', () => ({
  recordFinancialAudit: mocks.recordFinancialAudit,
}));

vi.mock('../../lib/server/stockEntryWac.js', () => ({
  patchStockMoveCorrectedBy: vi.fn().mockResolvedValue(undefined),
  maybeRevertWacAfterEntryCorrection: vi.fn().mockResolvedValue({ reverted: false }),
}));

const databases = {
  getDocument: mocks.getDocument,
  listDocuments: mocks.listDocuments,
};

describe('executeStockEntryCorrection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'tx-col';
    mocks.getDocument.mockResolvedValue({
      $id: 'move-1',
      academy_id: 'acad-1',
      item_estoque_id: 'item-1',
      tipo: 'entrada',
      quantidade: 10,
      financial_tx_id: 'tx-1',
      $createdAt: '2026-06-25T10:00:00.000Z',
    });
    mocks.listDocuments.mockResolvedValue({ documents: [] });
    mocks.reverseSettledFinanceTx.mockResolvedValue({ original: { id: 'tx-1' }, reversal: { id: 'tx-rev' } });
    mocks.createStockPurchaseFinanceTx.mockResolvedValue({ $id: 'tx-new' });
    mocks.resolveStockDocument.mockResolvedValue({ doc: { nome: 'Kimono', unit: 'unidade' } });
    mocks.executeInventoryAdjustment.mockResolvedValue({
      ok: true,
      movimento_id: 'adj-1',
      quantity_after: 8,
    });
  });

  it('rejeita movimento que não é entrada', async () => {
    mocks.getDocument.mockResolvedValueOnce({
      $id: 'm2',
      academy_id: 'acad-1',
      tipo: 'ajuste',
      quantidade: 1,
    });
    const { executeStockEntryCorrection } = await import('../../lib/server/stockEntryCorrection.js');
    const out = await executeStockEntryCorrection(databases, {
      dbId: 'db',
      stockMovesCol: 'moves',
      stockItemsCol: 'items',
      moveId: 'm2',
      correction: 'quantity_only',
      newQuantity: 2,
      academyId: 'acad-1',
      academyDoc: { modules: { finance: true } },
      me: { $id: 'user-1' },
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe('only_entrada');
  });

  it('corrige quantidade com ajuste', async () => {
    const { executeStockEntryCorrection } = await import('../../lib/server/stockEntryCorrection.js');
    const out = await executeStockEntryCorrection(databases, {
      dbId: 'db',
      stockMovesCol: 'moves',
      stockItemsCol: 'items',
      moveId: 'move-1',
      correction: 'quantity_only',
      newQuantity: 8,
      academyId: 'acad-1',
      academyDoc: {},
      me: { $id: 'user-1', name: 'Admin' },
    });
    expect(out.ok).toBe(true);
    expect(out.adjustment_move_id).toBe('adj-1');
    expect(mocks.executeInventoryAdjustment).toHaveBeenCalledWith(
      databases,
      expect.objectContaining({
        quantityChange: -2,
        subtype: 'correcao_entrada',
      })
    );
  });

  it('estorna e recria despesa em finance_only', async () => {
    const moveDoc = {
      $id: 'move-1',
      academy_id: 'acad-1',
      item_estoque_id: 'item-1',
      tipo: 'entrada',
      quantidade: 10,
      financial_tx_id: 'tx-1',
      $createdAt: '2026-06-25T10:00:00.000Z',
    };
    const txDoc = {
      $id: 'tx-1',
      academyId: 'acad-1',
      status: 'settled',
      gross: 100,
    };
    mocks.getDocument.mockImplementation((_db, _col, id) => {
      if (id === 'move-1') return Promise.resolve(moveDoc);
      if (id === 'tx-1') return Promise.resolve(txDoc);
      return Promise.reject(new Error('not_found'));
    });

    const { executeStockEntryCorrection } = await import('../../lib/server/stockEntryCorrection.js');
    const out = await executeStockEntryCorrection(databases, {
      dbId: 'db',
      stockMovesCol: 'moves',
      stockItemsCol: 'items',
      moveId: 'move-1',
      correction: 'finance_only',
      newPurchasePrice: 150,
      newPaymentMethod: 'pix',
      academyId: 'acad-1',
      academyDoc: { modules: { finance: true } },
      me: { $id: 'user-1' },
    });
    expect(out.ok).toBe(true);
    expect(mocks.reverseSettledFinanceTx).toHaveBeenCalled();
    expect(mocks.createStockPurchaseFinanceTx).toHaveBeenCalled();
    expect(mocks.patchStockMoveFinancialTxId).toHaveBeenCalledWith(
      databases,
      'db',
      'moves',
      'move-1',
      'tx-new'
    );
  });
});
