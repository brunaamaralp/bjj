import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cancelSaleFinancials } from '../saleCancelFinancials.js';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  createDocumentResilient: vi.fn(),
}));

vi.mock('../appwriteSchemaResilient.js', () => ({
  createDocumentResilient: (...args) => mocks.createDocumentResilient(...args),
}));

describe('cancelSaleFinancials', () => {
  const databases = {
    listDocuments: mocks.listDocuments,
    updateDocument: mocks.updateDocument,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDocumentResilient.mockResolvedValue({ $id: 'refund-1' });
    mocks.updateDocument.mockResolvedValue({});
  });

  it('cancela txs pendentes sem estorno quando nada foi recebido', async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [
        { $id: 'tx1', type: 'product', status: 'pending', net: 100, gross: 100 },
      ],
    });

    const out = await cancelSaleFinancials(databases, {
      dbId: 'db',
      financialTxCol: 'fin',
      vendaId: 'sale-1',
      venda: { forma_pagamento: 'pix', academyId: 'acad-1' },
      academyId: 'acad-1',
    });

    expect(out.refund_total).toBe(0);
    expect(mocks.updateDocument).toHaveBeenCalledWith('db', 'fin', 'tx1', {
      status: 'cancelled',
      settledAt: '',
    });
    expect(mocks.createDocumentResilient).not.toHaveBeenCalled();
  });

  it('estorna valor settled e cria tx refund', async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [
        { $id: 'tx1', type: 'product', status: 'settled', net: 80, gross: 80 },
      ],
    });

    const out = await cancelSaleFinancials(databases, {
      dbId: 'db',
      financialTxCol: 'fin',
      vendaId: 'sale-99',
      venda: { forma_pagamento: 'pix', academyId: 'acad-1' },
      academyId: 'acad-1',
    });

    expect(out.refund_total).toBe(80);
    expect(mocks.createDocumentResilient).toHaveBeenCalledTimes(1);
    const payload = mocks.createDocumentResilient.mock.calls[0][4];
    expect(payload.type).toBe('refund');
    expect(payload.net).toBe(80);
    expect(payload.reverses_id).toBe('tx1');
  });

  it('não duplica refund se já existe reversal', async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [
        { $id: 'tx1', type: 'product', status: 'settled', net: 50, gross: 50 },
        { $id: 'tx2', type: 'refund', status: 'settled', origin_type: 'reversal', net: 50 },
      ],
    });

    const out = await cancelSaleFinancials(databases, {
      dbId: 'db',
      financialTxCol: 'fin',
      vendaId: 'sale-1',
      venda: {},
      academyId: 'acad-1',
    });

    expect(out.refund_total).toBe(0);
    expect(mocks.createDocumentResilient).not.toHaveBeenCalled();
  });
});
