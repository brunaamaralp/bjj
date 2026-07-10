import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.SALES_COL = 'sales-col';
  process.env.SALE_ITEMS_COL = 'sale-items-col';
  process.env.STOCK_ITEMS_COL = 'stock-col';
  return {
    getDocument: vi.fn(),
    ensureAuth: vi.fn(),
    ensureAcademyAccess: vi.fn(),
    isAcademyOwnerOrAdminUser: vi.fn(),
  };
});

vi.mock('../academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  isAcademyOwnerOrAdminUser: (...args) => mocks.isAcademyOwnerOrAdminUser(...args),
  databases: {
    getDocument: (...args) => mocks.getDocument(...args),
  },
  DB_ID: 'db-test',
}));

import salesUpdateItemHandler from '../salesUpdateItemHandler.js';

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

describe('salesUpdateItemHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1', name: 'Test' });
    mocks.ensureAcademyAccess.mockResolvedValue({
      academyId: 'acad-1',
      doc: { settings: '{}', financeConfig: '{}' },
    });
  });

  it('forbidden_role quando usuário não é titular/admin', async () => {
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(false);
    const res = mockRes();
    await salesUpdateItemHandler(
      {
        method: 'PATCH',
        body: {
          action: 'alterar_item',
          id: 'sale-1',
          sale_item_id: 'item-1',
          novo_item: { item_estoque_id: 'stock-2' },
        },
      },
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden_role');
  });

  it('sale_not_concluded quando venda cancelada', async () => {
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(true);
    mocks.getDocument.mockResolvedValueOnce({
      $id: 'sale-1',
      academyId: 'acad-1',
      status: 'cancelada',
      total: 50,
    });
    const res = mockRes();
    await salesUpdateItemHandler(
      {
        method: 'PATCH',
        body: {
          action: 'alterar_item',
          id: 'sale-1',
          sale_item_id: 'item-1',
          novo_item: { item_estoque_id: 'stock-2' },
        },
      },
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('sale_not_concluded');
  });

  it('same_item quando novo produto é igual ao atual', async () => {
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(true);
    mocks.getDocument
      .mockResolvedValueOnce({
        $id: 'sale-1',
        academyId: 'acad-1',
        status: 'concluida',
        total: 50,
      })
      .mockResolvedValueOnce({
        $id: 'item-1',
        venda_id: 'sale-1',
        product_variant_id: 'stock-1',
        quantidade: 1,
      });
    const res = mockRes();
    await salesUpdateItemHandler(
      {
        method: 'PATCH',
        body: {
          action: 'alterar_item',
          id: 'sale-1',
          sale_item_id: 'item-1',
          novo_item: { item_estoque_id: 'stock-1' },
        },
      },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('same_item');
  });
});
