import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.SALES_COL = 'sales-col';
  process.env.SALE_ITEMS_COL = 'sale-items-col';
  process.env.STOCK_ITEMS_COL = 'stock-col';
  process.env.STOCK_MOVES_COL = 'stock-moves-col';
  return {
    getDocument: vi.fn(),
    updateDocument: vi.fn(),
    listDocuments: vi.fn(),
    ensureAuth: vi.fn(),
    ensureAcademyAccess: vi.fn(),
    isAcademyOwnerOrAdminUser: vi.fn(),
    revertSaleItemsStock: vi.fn(),
    updateDocumentResilient: vi.fn(),
    recordAuditEvent: vi.fn(),
  };
});

vi.mock('../academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  isAcademyOwnerOrAdminUser: (...args) => mocks.isAcademyOwnerOrAdminUser(...args),
  databases: {
    getDocument: (...args) => mocks.getDocument(...args),
    listDocuments: (...args) => mocks.listDocuments(...args),
  },
  DB_ID: 'db-test',
}));

vi.mock('../salesCancelHandler.js', () => ({
  revertSaleItemsStock: (...args) => mocks.revertSaleItemsStock(...args),
}));

vi.mock('../appwriteSchemaResilient.js', () => ({
  updateDocumentResilient: (...args) => mocks.updateDocumentResilient(...args),
}));

vi.mock('../auditLog.js', () => ({
  recordAuditEvent: (...args) => mocks.recordAuditEvent(...args),
  actorFromMe: () => ({ id: 'user-1' }),
}));

import salesDiscardDraftHandler from '../salesDiscardDraftHandler.js';

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

describe('salesDiscardDraftHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1', name: 'Test' });
    mocks.ensureAcademyAccess.mockResolvedValue({
      academyId: 'acad-1',
      doc: { settings: '{}' },
    });
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(true);
    mocks.listDocuments.mockResolvedValue({ documents: [{ $id: 'item-1', quantidade: 1 }] });
    mocks.revertSaleItemsStock.mockResolvedValue([{ display_label: 'Kimono', quantidade: 1 }]);
    mocks.updateDocumentResilient.mockResolvedValue({});
    mocks.recordAuditEvent.mockResolvedValue({});
  });

  it('forbidden_role para member', async () => {
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(false);
    const res = mockRes();
    await salesDiscardDraftHandler(
      {
        method: 'PATCH',
        body: { id: 'sale-1', action: 'descartar_rascunho' },
      },
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden_role');
  });

  it('sale_not_draft quando venda concluída', async () => {
    mocks.getDocument.mockResolvedValue({
      $id: 'sale-1',
      academyId: 'acad-1',
      status: 'concluida',
    });
    const res = mockRes();
    await salesDiscardDraftHandler(
      {
        method: 'PATCH',
        body: { id: 'sale-1', action: 'descartar_rascunho' },
      },
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('sale_not_draft');
  });

  it('descarta rascunho e devolve estoque', async () => {
    mocks.getDocument.mockResolvedValue({
      $id: 'sale-1',
      academyId: 'acad-1',
      status: 'rascunho',
    });
    const res = mockRes();
    await salesDiscardDraftHandler(
      {
        method: 'PATCH',
        body: { id: 'sale-1', action: 'descartar_rascunho' },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.discarded).toBe(true);
    expect(mocks.revertSaleItemsStock).toHaveBeenCalled();
    expect(mocks.updateDocumentResilient).toHaveBeenCalled();
  });
});
