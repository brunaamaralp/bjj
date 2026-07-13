import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.SALES_COL = 'sales-col';
  process.env.SALE_ITEMS_COL = 'sale-items-col';
  process.env.STOCK_ITEMS_COL = 'stock-col';
  process.env.STOCK_MOVES_COL = 'stock-moves-col';
  process.env.FINANCIAL_TX_COL = 'fin-col';
  return {
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    updateDocument: vi.fn(),
    ensureAuth: vi.fn(),
    ensureAcademyAccess: vi.fn(),
    isAcademyOwnerOrAdminUser: vi.fn(),
    cancelSaleFinancials: vi.fn(),
    updateDocumentResilient: vi.fn(),
    createStockMoveDocument: vi.fn(),
    resolveStockDocument: vi.fn(),
    closeKimonoLoansForSale: vi.fn(),
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
    updateDocument: (...args) => mocks.updateDocument(...args),
  },
  DB_ID: 'db-test',
}));

vi.mock('../saleCancelFinancials.js', () => ({
  cancelSaleFinancials: (...args) => mocks.cancelSaleFinancials(...args),
}));

vi.mock('../appwriteSchemaResilient.js', () => ({
  updateDocumentResilient: (...args) => mocks.updateDocumentResilient(...args),
}));

vi.mock('../stockMoveFields.js', () => ({
  createStockMoveDocument: (...args) => mocks.createStockMoveDocument(...args),
}));

vi.mock('../productCatalogDb.js', () => ({
  resolveStockDocument: (...args) => mocks.resolveStockDocument(...args),
}));

vi.mock('../kimonoLoanRecords.js', () => ({
  closeKimonoLoansForSale: (...args) => mocks.closeKimonoLoansForSale(...args),
}));

vi.mock('../auditLog.js', () => ({
  recordAuditEvent: (...args) => mocks.recordAuditEvent(...args),
  actorFromMe: () => ({ id: 'user-1' }),
}));

vi.mock('../../../functions/stockBalance.mjs', () => ({
  itemDisplayName: () => 'Item',
}));

import salesCancelHandler from '../salesCancelHandler.js';

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
  return res;
}

describe('salesCancelHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1', name: 'Titular' });
    // Shape real de ensureAcademyAccess: { academyId, doc } — não academyDoc
    mocks.ensureAcademyAccess.mockResolvedValue({
      academyId: 'acad-1',
      doc: { $id: 'acad-1', ownerId: 'user-1', teamId: 'team-1' },
    });
    mocks.isAcademyOwnerOrAdminUser.mockImplementation(async (doc, me) => {
      const ownerId = String(doc?.ownerId || '').trim();
      const userId = String(me?.$id || '').trim();
      return Boolean(ownerId && userId && ownerId === userId);
    });
    mocks.cancelSaleFinancials.mockResolvedValue({ refund_total: 0 });
    mocks.updateDocumentResilient.mockResolvedValue({});
    mocks.listDocuments.mockResolvedValue({ documents: [] });
    mocks.closeKimonoLoansForSale.mockResolvedValue({ closed: 0 });
    mocks.recordAuditEvent.mockResolvedValue({});
  });

  it('cancela venda pendente quando access retorna doc (não academyDoc)', async () => {
    mocks.getDocument.mockResolvedValue({
      $id: 'sale-pending',
      academyId: 'acad-1',
      status: 'pendente',
      forma_pagamento: 'A receber',
    });

    const res = mockRes();
    await salesCancelHandler(
      {
        method: 'PATCH',
        body: { id: 'sale-pending', action: 'cancelar', motivo: 'Erro na venda' },
      },
      res
    );

    expect(mocks.isAcademyOwnerOrAdminUser).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user-1' }),
      expect.objectContaining({ $id: 'user-1' })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'cancelada', venda_id: 'sale-pending' });
  });

  it('forbidden_role quando usuário não é titular/admin', async () => {
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(false);
    mocks.getDocument.mockResolvedValue({
      $id: 'sale-1',
      academyId: 'acad-1',
      status: 'pendente',
    });

    const res = mockRes();
    await salesCancelHandler(
      {
        method: 'PATCH',
        body: { id: 'sale-1', action: 'cancelar', motivo: 'Erro' },
      },
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden_role');
  });
});
