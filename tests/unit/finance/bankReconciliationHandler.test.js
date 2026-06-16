import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'financial_tx';
  process.env.VITE_APPWRITE_BANK_STATEMENTS_COLLECTION_ID = 'bank_statements';
  process.env.VITE_APPWRITE_BANK_STATEMENT_ITEMS_COLLECTION_ID = 'bank_statement_items';
});

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  isAcademyOwnerOrAdminUser: vi.fn(),
  getDocument: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  loadAccounts: vi.fn(),
}));

vi.mock('../../../lib/server/academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  isAcademyOwnerOrAdminUser: (...args) => mocks.isAcademyOwnerOrAdminUser(...args),
  DB_ID: 'db',
  databases: {
    getDocument: (...args) => mocks.getDocument(...args),
    createDocument: (...args) => mocks.createDocument(...args),
    updateDocument: (...args) => mocks.updateDocument(...args),
    listDocuments: vi.fn().mockResolvedValue({ documents: [] }),
  },
}));

vi.mock('../../../lib/server/financeJournalServer.js', () => ({
  loadAccounts: (...args) => mocks.loadAccounts(...args),
}));

vi.mock('../../../lib/server/academyEvents.js', () => ({
  recordAcademyEvent: vi.fn(),
  BANK_RECONCILIATION_EVENT_TYPES: {},
}));

import bankReconciliationHandler from '../../../lib/server/bankReconciliationHandler.js';

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

const academyDoc = { $id: 'acad-1' };

describe('bankReconciliationHandler create-tx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'acad-1', doc: academyDoc });
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(true);
    mocks.loadAccounts.mockResolvedValue([
      { code: '3.1.1', name: 'Capital social', type: 'pl', isActive: true },
    ]);
  });

  it('rejeita create-tx sem categoria', async () => {
    mocks.getDocument
      .mockResolvedValueOnce({
        $id: 'item-1',
        statement_id: 'st-1',
        direction: 'credit',
        amount: 500,
        date: '2026-01-15',
        description: 'PIX APORTE',
        status: 'unmatched',
      })
      .mockResolvedValueOnce({ $id: 'st-1', academy_id: 'acad-1', bank_account: 'Sicoob' });

    const res = mockRes();
    await bankReconciliationHandler(
      {
        method: 'POST',
        query: { route: 'create-tx' },
        body: { item_id: 'item-1' },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('category_required');
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it('rejeita categoria inválida', async () => {
    mocks.getDocument
      .mockResolvedValueOnce({
        $id: 'item-1',
        statement_id: 'st-1',
        direction: 'credit',
        amount: 500,
        date: '2026-01-15',
        description: 'PIX APORTE',
        status: 'unmatched',
      })
      .mockResolvedValueOnce({ $id: 'st-1', academy_id: 'acad-1', bank_account: 'Sicoob' });

    const res = mockRes();
    await bankReconciliationHandler(
      {
        method: 'POST',
        query: { route: 'create-tx' },
        body: { item_id: 'item-1', category: 'Categoria inexistente' },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('category_invalid');
  });

  it('cria lançamento com tipo derivado da categoria (aporte)', async () => {
    mocks.getDocument
      .mockResolvedValueOnce({
        $id: 'item-1',
        statement_id: 'st-1',
        direction: 'credit',
        amount: 500,
        date: '2026-01-15',
        description: 'PIX APORTE SOCIO',
        status: 'unmatched',
      })
      .mockResolvedValueOnce({ $id: 'st-1', academy_id: 'acad-1', bank_account: 'Sicoob' });

    mocks.createDocument.mockResolvedValue({
      $id: 'tx-new',
      academyId: 'acad-1',
      type: 'equity_injection',
      category: 'Aporte de capital',
      gross: 500,
      status: 'settled',
      direction: 'in',
    });
    mocks.updateDocument.mockResolvedValue({});

    const res = mockRes();
    await bankReconciliationHandler(
      {
        method: 'POST',
        query: { route: 'create-tx' },
        body: { item_id: 'item-1', category: 'Aporte de capital' },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mocks.createDocument).toHaveBeenCalled();
    const payload = mocks.createDocument.mock.calls[0][3];
    expect(payload.type).toBe('equity_injection');
    expect(payload.category).toBe('Aporte de capital');
    expect(payload.direction).toBe('in');
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db',
      'bank_statement_items',
      'item-1',
      expect.objectContaining({ status: 'matched', matched_tx_id: 'tx-new' })
    );
  });
});

describe('bankReconciliationHandler confirm-match learn_payer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID = 'students';
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1', name: 'Owner' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'acad-1', doc: academyDoc });
    mocks.isAcademyOwnerOrAdminUser.mockResolvedValue(true);
  });

  it('retorna learn_payer após confirmar match de crédito', async () => {
    mocks.getDocument
      .mockResolvedValueOnce({
        $id: 'item-1',
        statement_id: 'st-1',
        direction: 'credit',
        amount: 200,
        description: 'PIX RECEBIDO JOSE SANTOS',
        status: 'unmatched',
      })
      .mockResolvedValueOnce({ $id: 'st-1', academy_id: 'acad-1', bank_account: 'Sicoob' })
      .mockResolvedValueOnce({
        $id: 'tx-1',
        academyId: 'acad-1',
        lead_id: 'lead-1',
        gross: 200,
        direction: 'in',
        status: 'settled',
        settledAt: '2026-06-10',
        bank_account: 'Sicoob',
        reconciled: false,
      })
      .mockResolvedValueOnce({
        $id: 'lead-1',
        academyId: 'acad-1',
        name: 'Pedro Santos',
        responsavel: 'Ana Santos',
        payer_aliases_json: '[]',
      });

    const { databases } = await import('../../../lib/server/academyAccess.js');
    databases.listDocuments.mockResolvedValueOnce({
      documents: [
        {
          $id: 'lead-1',
          academyId: 'acad-1',
          name: 'Pedro Santos',
          responsavel: 'Ana Santos',
          payer_aliases_json: '[]',
        },
      ],
    });

    mocks.updateDocument.mockResolvedValue({});

    const res = mockRes();
    await bankReconciliationHandler(
      {
        method: 'POST',
        query: { route: 'confirm-match' },
        body: { item_id: 'item-1', transaction_id: 'tx-1' },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.learn_payer).toMatchObject({
      lead_id: 'lead-1',
      extracted_normalized: 'JOSE SANTOS',
      already_known: false,
    });
  });
});
