import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.SALES_COL = 'sales-col';
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'fin-col';
  process.env.VITE_APPWRITE_ACADEMIES_COL_ID = 'acad-col';
  return {
    getDocument: vi.fn(),
    updateDocument: vi.fn(),
    listDocuments: vi.fn(),
    ensureAuth: vi.fn(),
    ensureAcademyAccess: vi.fn(),
  };
});

vi.mock('../academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  databases: {
    getDocument: (...args) => mocks.getDocument(...args),
    updateDocument: (...args) => mocks.updateDocument(...args),
    listDocuments: (...args) => mocks.listDocuments(...args),
  },
  DB_ID: 'db-test',
}));

vi.mock('../salesMirror.js', () => ({
  mirrorMixedPayments: vi.fn().mockResolvedValue({ ok: true }),
  refreshPendingSaleBalance: vi.fn().mockResolvedValue({}),
}));

vi.mock('../financeJournalServer.js', () => ({
  applyAccountingSideEffectsAutoServer: vi.fn().mockResolvedValue({}),
}));

vi.mock('../financialAuditLog.js', () => ({
  recordFinancialAudit: vi.fn().mockResolvedValue({}),
}));

import salesLiquidateHandler from '../salesLiquidateHandler.js';

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

describe('salesLiquidateHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1', name: 'Test' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'acad-1', doc: { financeConfig: '{}' } });
    mocks.listDocuments.mockResolvedValue({ documents: [] });
    mocks.updateDocument.mockResolvedValue({});
  });

  it('rejeita método GET', async () => {
    const res = mockRes();
    await salesLiquidateHandler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('method_not_allowed');
  });

  it('rejeita payload sem action liquidar', async () => {
    const res = mockRes();
    await salesLiquidateHandler(
      { method: 'PATCH', body: { id: 'sale-1', action: 'outro' } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_payload');
  });

  it('forbidden quando academy_id do body diverge', async () => {
    const res = mockRes();
    await salesLiquidateHandler(
      {
        method: 'PATCH',
        body: { id: 'sale-1', action: 'liquidar', academy_id: 'outra', pagamentos: [{ forma: 'pix', valor: 10 }] },
      },
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  it('sale_not_open quando venda já concluída', async () => {
    mocks.getDocument.mockResolvedValue({
      $id: 'sale-1',
      academyId: 'acad-1',
      status: 'concluida',
      total: 100,
      pagamentos_json: '[]',
    });
    const res = mockRes();
    await salesLiquidateHandler(
      {
        method: 'PATCH',
        body: {
          id: 'sale-1',
          action: 'liquidar',
          pagamentos: [{ forma: 'pix', valor: 50 }],
        },
      },
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('sale_not_open');
  });

  it('liquida venda pendente com pagamento parcial', async () => {
    mocks.getDocument.mockResolvedValue({
      $id: 'sale-1',
      academyId: 'acad-1',
      status: 'pendente',
      total: 100,
      pagamentos_json: '[]',
      itens_snapshot_json: '[]',
    });
    const res = mockRes();
    await salesLiquidateHandler(
      {
        method: 'PATCH',
        body: {
          id: 'sale-1',
          action: 'liquidar',
          pagamentos: [{ forma: 'pix', valor: 40 }],
          pagamentos_snapshot: '[]',
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.partial).toBe(true);
    expect(mocks.updateDocument).toHaveBeenCalled();
  });

  it('sale_payment_stale quando snapshot diverge', async () => {
    mocks.getDocument.mockResolvedValue({
      $id: 'sale-1',
      academyId: 'acad-1',
      status: 'pendente',
      total: 100,
      pagamentos_json: '[{"forma":"pix","valor":10,"net":10}]',
    });
    const res = mockRes();
    await salesLiquidateHandler(
      {
        method: 'PATCH',
        body: {
          id: 'sale-1',
          action: 'liquidar',
          pagamentos: [{ forma: 'pix', valor: 40 }],
          pagamentos_snapshot: '[]',
        },
      },
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('sale_payment_stale');
  });
});
