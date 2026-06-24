import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  listDocuments: vi.fn(),
  enrichSaleItemsBatch: vi.fn(),
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  DB_ID: 'db-test',
  databases: {
    listDocuments: (...args) => mocks.listDocuments(...args),
  },
}));

vi.mock('../../lib/server/reportBatchResolve.js', () => ({
  enrichSaleItemsBatch: (...args) => mocks.enrichSaleItemsBatch(...args),
}));

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.setHeader = (key, value) => {
    res.headers[key] = value;
  };
  return res;
}

describe('reportsByStudentHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_APPWRITE_SALES_COLLECTION_ID', 'sales-col');
    vi.stubEnv('VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID', 'sale-items-col');
    vi.stubEnv('VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID', 'payments-col');
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'ac-1' });
    mocks.enrichSaleItemsBatch.mockResolvedValue([
      {
        venda_id: 'sale-1',
        item_estoque_id: 'item-1',
        display_label: 'Kimono',
        quantidade: 1,
      },
    ]);
  });

  it('mantem venda deferred como pendente no extrato do aluno', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({
        documents: [
          {
            $id: 'sale-1',
            academy_id: 'ac-1',
            aluno_id: 'lead-1',
            status: 'pendente',
            total: 150,
            forma_pagamento: 'A receber',
            pagamentos_json: '[]',
            created_by_name: 'Atendente',
            $createdAt: '2026-06-23T12:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({
        documents: [
          {
            $id: 'si-1',
            venda_id: 'sale-1',
            item_estoque_id: 'item-1',
            quantidade: 1,
          },
        ],
      });

    const handler = (await import('../../lib/server/reportsByStudentHandler.js')).default;
    const res = mockRes();

    await handler({ method: 'GET', query: { lead_id: 'lead-1' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.timeline).toHaveLength(1);
    expect(res.body.timeline[0]).toMatchObject({
      type: 'product_sale',
      status: 'pending',
      amount: 150,
    });
    expect(res.body.totals.total_gasto_produtos).toBe(0);
    expect(res.body.totals.total_em_aberto).toBe(150);
  });
});
