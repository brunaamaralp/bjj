import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.SALES_COL = 'sales';
  process.env.VITE_APPWRITE_SALES_COLLECTION_ID = 'sales';
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'financial_tx';
});

import {
  validatePagamentosAgainstTotal,
  sumPagamentosNet,
  deriveSalePaidAmount,
  resolveSaleLiquidationContext,
} from '../functions/salePayments.mjs';

const mirrorMocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (...args) => JSON.stringify(['equal', ...args]),
    limit: (n) => JSON.stringify(['limit', n]),
  },
  ID: { unique: () => 'tx-new' },
}));

vi.mock('../lib/server/academyAccess.js', () => ({
  databases: {
    createDocument: (...args) => mirrorMocks.createDocument(...args),
    listDocuments: (...args) => mirrorMocks.listDocuments(...args),
    getDocument: (...args) => mirrorMocks.getDocument(...args),
    updateDocument: (...args) => mirrorMocks.updateDocument(...args),
  },
  DB_ID: 'db-test',
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
}));

vi.mock('../lib/server/financialAuditLog.js', () => ({
  recordFinancialAudit: vi.fn(),
}));

vi.mock('../lib/server/financeJournalServer.js', () => ({
  applyAccountingSideEffectsAutoServer: vi.fn(),
}));

vi.mock('../lib/server/salePaymentRules.js', () => ({
  validateAndNormalizeSalePayments: vi.fn((_, payments) => ({ ok: true, payments })),
  resolveSaleMirrorBankAccountForPayment: vi.fn(() => ''),
}));

import {
  mirrorPartialSale,
  SALE_BALANCE_NOTE_PREFIX,
} from '../lib/server/salesMirror.js';
import salesLiquidateHandler from '../lib/server/salesLiquidateHandler.js';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';

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

describe('validatePagamentosAgainstTotal (partial)', () => {
  it('aceita net < total com partial: true', () => {
    const pagamentos = [{ forma: 'pix', valor: 50 }];
    const r = validatePagamentosAgainstTotal(pagamentos, 100, { partial: true });
    expect(r.ok).toBe(true);
    expect(r.partial).toBe(true);
    expect(r.net).toBe(50);
  });

  it('rejeita net === 0 com partial: true', () => {
    const r = validatePagamentosAgainstTotal([], 100, { partial: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('zero_payment');
  });

  it('sem partial continua rejeitando net < total', () => {
    const pagamentos = [{ forma: 'pix', valor: 50 }];
    const r = validatePagamentosAgainstTotal(pagamentos, 100);
    expect(r.ok).toBe(false);
  });
});

describe('mirrorPartialSale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'financial_tx';
    mirrorMocks.listDocuments.mockResolvedValue({ documents: [] });
    mirrorMocks.createDocument.mockImplementation(async (_db, _col, id, payload) => ({
      $id: id,
      ...payload,
    }));
    mirrorMocks.getDocument.mockRejectedValue(new Error('no academy'));
  });

  it('cria TX settled + TX pending com gross do saldo', async () => {
    const pagamentos = [{ forma: 'pix', valor: 40 }];
    const result = await mirrorPartialSale({
      vendaId: 'sale-1',
      totalRounded: 100,
      paidAmount: 40,
      pagamentosNorm: pagamentos,
      description: 'Kimono',
      academyId: 'ac-1',
      aluno_id: 'lead-1',
      clienteNome: 'João',
    });

    expect(result.warnings).toEqual([]);
    expect(mirrorMocks.createDocument).toHaveBeenCalled();
    const payloads = mirrorMocks.createDocument.mock.calls.map((c) => c[3]);
    const settled = payloads.find((p) => p.status === 'settled' || p.gross === 40);
    const pending = payloads.find((p) => p.status === 'pending');
    expect(settled).toBeTruthy();
    expect(settled.gross).toBe(40);
    expect(pending).toBeTruthy();
    expect(pending.gross).toBe(60);
    expect(pending.note).toContain(SALE_BALANCE_NOTE_PREFIX);
    expect(pending.saleId).toBe('sale-1');
  });
});

describe('salesCreateHandler partial (unit)', () => {
  it('sumPagamentosNet reflete paid_amount esperado', () => {
    const pagamentos = [
      { forma: 'pix', valor: 30 },
      { forma: 'dinheiro', valor: 20, troco: 5, forma_troco: 'pix' },
    ];
    expect(sumPagamentosNet(pagamentos)).toBe(45);
  });

  it('deriveSalePaidAmount usa pagamentos_json quando paid_amount ausente', () => {
    const sale = {
      status: 'parcial',
      total: 100,
      pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 40 }]),
    };
    expect(deriveSalePaidAmount(sale)).toBe(40);
    const ctx = resolveSaleLiquidationContext(sale);
    expect(ctx.isPartialSale).toBe(true);
    expect(ctx.balanceDue).toBe(60);
  });
});

describe('salesLiquidateHandler (parcial)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SALES_COL = 'sales';
    process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'financial_tx';
    ensureAuth.mockResolvedValue({ $id: 'user-1' });
    ensureAcademyAccess.mockResolvedValue({ academyId: 'ac-1' });
    mirrorMocks.getDocument.mockReset();
    mirrorMocks.updateDocument.mockReset();
    mirrorMocks.listDocuments.mockReset();
    mirrorMocks.createDocument.mockReset();
  });

  it('quita saldo sem paid_amount no documento (só pagamentos_json)', async () => {
    const saleDoc = {
      $id: 'sale-partial',
      academyId: 'ac-1',
      status: 'parcial',
      total: 100,
      pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 40 }]),
      itens_snapshot_json: JSON.stringify([{ label: 'Kimono', quantidade: 1 }]),
      aluno_id: 'lead-1',
    };
    mirrorMocks.getDocument.mockResolvedValue(saleDoc);
    mirrorMocks.updateDocument.mockResolvedValue({ ...saleDoc, status: 'concluida' });
    mirrorMocks.listDocuments.mockResolvedValue({
      documents: [
        {
          $id: 'tx-balance',
          status: 'pending',
          note: `${SALE_BALANCE_NOTE_PREFIX} — João`,
          saleId: 'sale-partial',
        },
      ],
    });
    mirrorMocks.createDocument.mockResolvedValue({ $id: 'tx-settled', status: 'settled' });

    const res = mockRes();
    await salesLiquidateHandler(
      {
        method: 'PATCH',
        body: {
          id: 'sale-partial',
          action: 'liquidar',
          pagamentos: [{ forma: 'pix', valor: 60 }],
        },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('concluida');
  });

  it('quita saldo e vira concluida', async () => {
    const saleDoc = {
      $id: 'sale-partial',
      academyId: 'ac-1',
      status: 'parcial',
      total: 100,
      paid_amount: 40,
      pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 40 }]),
      itens_snapshot_json: JSON.stringify([{ label: 'Kimono', quantidade: 1 }]),
      aluno_id: 'lead-1',
    };
    mirrorMocks.getDocument.mockResolvedValue(saleDoc);
    mirrorMocks.updateDocument.mockResolvedValue({ ...saleDoc, status: 'concluida' });
    mirrorMocks.listDocuments.mockResolvedValue({
      documents: [
        {
          $id: 'tx-balance',
          status: 'pending',
          note: `${SALE_BALANCE_NOTE_PREFIX} — João`,
          saleId: 'sale-partial',
        },
      ],
    });
    mirrorMocks.createDocument.mockResolvedValue({ $id: 'tx-settled', status: 'settled' });

    const res = mockRes();
    await salesLiquidateHandler(
      {
        method: 'PATCH',
        body: {
          id: 'sale-partial',
          action: 'liquidar',
          pagamentos: [{ forma: 'pix', valor: 60 }],
        },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('concluida');
    const salePatch = mirrorMocks.updateDocument.mock.calls.find((c) => c[2] === 'sale-partial')?.[3];
    expect(salePatch.paid_amount).toBe(100);
    expect(salePatch.status).toBe('concluida');
  });

  it('rejeita pagamento maior que balance_due', async () => {
    mirrorMocks.getDocument.mockResolvedValue({
      $id: 'sale-partial',
      academyId: 'ac-1',
      status: 'parcial',
      total: 100,
      paid_amount: 40,
      pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 40 }]),
    });

    const res = mockRes();
    await salesLiquidateHandler(
      {
        method: 'PATCH',
        body: {
          id: 'sale-partial',
          action: 'liquidar',
          pagamentos: [{ forma: 'pix', valor: 70 }],
        },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('pagamentos_total_mismatch');
    expect(res.body.expected).toBe(60);
  });
});
