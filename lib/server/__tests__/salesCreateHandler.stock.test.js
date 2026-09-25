import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.SALES_COL = 'sales-col';
  process.env.SALE_ITEMS_COL = 'sale-items-col';
  process.env.STOCK_ITEMS_COL = 'stock-col';
  process.env.STOCK_MOVES_COL = 'stock-moves-col';
  return {
    listDocuments: vi.fn(),
    deleteDocument: vi.fn(),
    updateDocument: vi.fn(),
    ensureAuth: vi.fn(),
    ensureAcademyAccess: vi.fn(),
    isAcademyOwnerOrAdminUser: vi.fn(),
    resolveStockDocument: vi.fn(),
    createDocumentResilient: vi.fn(),
    updateDocumentResilient: vi.fn(),
    createStockMoveDocument: vi.fn(),
    mirrorSaleFinancialsByLineKinds: vi.fn(),
    mirrorDeferredSale: vi.fn(),
    mirrorSaleFinancialsForDoc: vi.fn(),
    recordSaleItemCmv: vi.fn(),
    recordFinancialAudit: vi.fn(),
    recordAuditEvent: vi.fn(),
    notifyAcademyOwner: vi.fn(),
    recordKimonoLoanAfterRentalExit: vi.fn(),
    isParentVariantCatalogEnabled: vi.fn(),
  };
});

vi.mock('../academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  isAcademyOwnerOrAdminUser: (...args) => mocks.isAcademyOwnerOrAdminUser(...args),
  databases: {
    listDocuments: (...args) => mocks.listDocuments(...args),
    deleteDocument: (...args) => mocks.deleteDocument(...args),
    updateDocument: (...args) => mocks.updateDocument(...args),
  },
  DB_ID: 'db-test',
}));

vi.mock('../productCatalogDb.js', () => ({
  resolveStockDocument: (...args) => mocks.resolveStockDocument(...args),
  PRODUCT_VARIANTS_COL: '',
  isParentVariantCatalogEnabled: () => mocks.isParentVariantCatalogEnabled(),
}));

vi.mock('../appwriteSchemaResilient.js', () => ({
  createDocumentResilient: (...args) => mocks.createDocumentResilient(...args),
  updateDocumentResilient: (...args) => mocks.updateDocumentResilient(...args),
}));

vi.mock('../stockMoveFields.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createStockMoveDocument: (...args) => mocks.createStockMoveDocument(...args),
  };
});

vi.mock('../salesMirror.js', () => ({
  mirrorSaleFinancials: vi.fn(),
  mirrorSaleFinancialsForDoc: (...args) => mocks.mirrorSaleFinancialsForDoc(...args),
  mirrorDeferredSale: (...args) => mocks.mirrorDeferredSale(...args),
  mirrorSaleFinancialsByLineKinds: (...args) => mocks.mirrorSaleFinancialsByLineKinds(...args),
}));

vi.mock('../saleCmv.js', () => ({
  recordSaleItemCmv: (...args) => mocks.recordSaleItemCmv(...args),
}));

vi.mock('../financialAuditLog.js', () => ({
  recordFinancialAudit: (...args) => mocks.recordFinancialAudit(...args),
}));

vi.mock('../auditLog.js', () => ({
  recordAuditEvent: (...args) => mocks.recordAuditEvent(...args),
  actorFromMe: () => ({ id: 'user-1' }),
}));

vi.mock('../notifyAcademy.js', () => ({
  notifyAcademyOwner: (...args) => mocks.notifyAcademyOwner(...args),
}));

vi.mock('../kimonoLoanRecords.js', () => ({
  recordKimonoLoanAfterRentalExit: (...args) => mocks.recordKimonoLoanAfterRentalExit(...args),
}));

vi.mock('../../../functions/stockBalance.mjs', () => ({
  itemDisplayName: (doc) => doc?.nome || 'Kimono A1',
}));

import salesCreateHandler from '../salesCreateHandler.js';

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.setHeader = () => res;
  return res;
}

function stockPatchesFromCalls() {
  return mocks.updateDocumentResilient.mock.calls
    .filter((c) => c[2] === 'stock-col')
    .map((c) => c[4]);
}

describe('salesCreateHandler stock baixa', () => {
  let stockState;

  beforeEach(() => {
    vi.clearAllMocks();
    stockState = {
      $id: 'sku-1',
      academy_id: 'acad-1',
      nome: 'Kimono A1',
      sale_quantity: 4,
      rental_available: 2,
      rental_out: 0,
      current_quantity: 6,
      sale_price: 100,
      cost_price: 40,
    };

    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1', name: 'Titular' });
    mocks.ensureAcademyAccess.mockResolvedValue({
      academyId: 'acad-1',
      doc: { $id: 'acad-1', ownerId: 'user-1', settings: '{}', financeConfig: '{}' },
    });
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(true);
    mocks.isParentVariantCatalogEnabled.mockReturnValue(false);
    mocks.listDocuments.mockResolvedValue({ total: 0, documents: [] });
    mocks.mirrorSaleFinancialsByLineKinds.mockResolvedValue({ warnings: [] });
    mocks.recordSaleItemCmv.mockResolvedValue({ cmv: 0, financial_tx_id: null });
    mocks.recordFinancialAudit.mockResolvedValue({});
    mocks.recordAuditEvent.mockResolvedValue({});
    mocks.recordKimonoLoanAfterRentalExit.mockResolvedValue({});
    mocks.createStockMoveDocument.mockImplementation(async () => ({
      $id: `move-${mocks.createStockMoveDocument.mock.calls.length}`,
      $createdAt: '2026-09-25T12:00:00.000Z',
    }));

    mocks.resolveStockDocument.mockImplementation(async () => ({
      doc: { ...stockState },
      collection: 'stock-col',
      parent: {
        id: 'prod-1',
        type: 'both',
        nome: 'Kimono',
        sale_price: 100,
        rental_price: 30,
        cost_price: 40,
      },
      suggested_price: 100,
      suggested_cost: 40,
    }));

    let createSeq = 0;
    mocks.createDocumentResilient.mockImplementation(async (_db, _dbId, col, id, payload) => {
      createSeq += 1;
      return { $id: id || `${col}-${createSeq}`, ...payload };
    });

    mocks.updateDocumentResilient.mockImplementation(async (_db, _dbId, col, id, patch) => {
      if (col === 'stock-col' && id === 'sku-1') {
        Object.assign(stockState, patch);
      }
      return { $id: id, ...patch };
    });
  });

  it('sale + rental no mesmo SKU acumulam baixa sem lost update', async () => {
    const res = mockRes();
    await salesCreateHandler(
      {
        method: 'POST',
        body: {
          forma_pagamento: 'pix',
          itens: [
            {
              item_estoque_id: 'sku-1',
              quantidade: 1,
              preco_unitario: 100,
              line_kind: 'sale',
            },
            {
              item_estoque_id: 'sku-1',
              quantidade: 1,
              preco_unitario: 30,
              line_kind: 'rental',
            },
          ],
        },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    const patches = stockPatchesFromCalls();
    expect(patches).toHaveLength(2);
    expect(patches[0]).toMatchObject({
      sale_quantity: 3,
      rental_available: 2,
      rental_out: 0,
      current_quantity: 5,
    });
    expect(patches[1]).toMatchObject({
      sale_quantity: 3,
      rental_available: 1,
      rental_out: 1,
      current_quantity: 4,
    });
    expect(stockState).toMatchObject({
      sale_quantity: 3,
      rental_available: 1,
      rental_out: 1,
      current_quantity: 4,
    });
  });

  it('duas linhas sale do mesmo SKU acumulam qty', async () => {
    stockState.sale_quantity = 5;
    stockState.rental_available = 0;
    stockState.current_quantity = 5;

    const res = mockRes();
    await salesCreateHandler(
      {
        method: 'POST',
        body: {
          forma_pagamento: 'pix',
          itens: [
            { item_estoque_id: 'sku-1', quantidade: 2, preco_unitario: 100, line_kind: 'sale' },
            { item_estoque_id: 'sku-1', quantidade: 3, preco_unitario: 100, line_kind: 'sale' },
          ],
        },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    const patches = stockPatchesFromCalls();
    expect(patches).toHaveLength(2);
    expect(patches[0]).toMatchObject({ sale_quantity: 3, current_quantity: 3 });
    expect(patches[1]).toMatchObject({ sale_quantity: 0, current_quantity: 0 });
    expect(stockState.sale_quantity).toBe(0);
  });

  it('rejeita oversell quando soma das linhas sale excede estoque', async () => {
    stockState.sale_quantity = 5;
    stockState.rental_available = 0;
    stockState.current_quantity = 5;

    const res = mockRes();
    await salesCreateHandler(
      {
        method: 'POST',
        body: {
          forma_pagamento: 'pix',
          itens: [
            { item_estoque_id: 'sku-1', quantidade: 3, preco_unitario: 100, line_kind: 'sale' },
            { item_estoque_id: 'sku-1', quantidade: 3, preco_unitario: 100, line_kind: 'sale' },
          ],
        },
      },
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('no_stock');
    expect(stockPatchesFromCalls()).toHaveLength(0);
    expect(stockState.sale_quantity).toBe(5);
  });
});
