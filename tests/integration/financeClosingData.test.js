import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fcMocks = vi.hoisted(() => {
  const envSnapshot = {};
  const ENV_KEYS = [
    'APPWRITE_PROJECT_ID',
    'APPWRITE_API_KEY',
    'VITE_APPWRITE_DATABASE_ID',
    'VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID',
    'APPWRITE_CASH_CLOSING_COLLECTION_ID',
  ];
  for (const k of ENV_KEYS) envSnapshot[k] = process.env[k];
  process.env.APPWRITE_PROJECT_ID = 'test-project';
  process.env.APPWRITE_API_KEY = 'test-key';
  process.env.VITE_APPWRITE_DATABASE_ID = 'db-test';
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'col-tx';
  process.env.APPWRITE_CASH_CLOSING_COLLECTION_ID = 'col-closing';
  return {
    ENV_KEYS,
    envSnapshot,
    listDocuments: vi.fn(),
    getDocument: vi.fn(),
    listPaymentsForMonth: vi.fn().mockResolvedValue({ rows: [], truncated: false }),
  };
});

vi.mock('node-appwrite', () => {
  class MockDatabases {
    listDocuments = fcMocks.listDocuments;
    getDocument = fcMocks.getDocument;
  }
  return {
    Client: vi.fn(function () {
      this.setEndpoint = () => this;
      this.setProject = () => this;
      this.setKey = () => this;
    }),
    Databases: MockDatabases,
    Teams: vi.fn(),
    Query: {
      equal: vi.fn((...a) => ({ equal: a })),
      limit: vi.fn((n) => ({ limit: n })),
      orderDesc: vi.fn((f) => ({ orderDesc: f })),
      greaterThanEqual: vi.fn((f, v) => ({ gte: [f, v] })),
      lessThanEqual: vi.fn((f, v) => ({ lte: [f, v] })),
      cursorAfter: vi.fn((id) => ({ cursorAfter: id })),
    },
  };
});

vi.mock('../../lib/server/financeReceivablesData.js', () => ({
  listPaymentsForMonth: (...args) => fcMocks.listPaymentsForMonth(...args),
}));

import {
  listFinancialTxForMonth,
  getCashClosing,
  loadClosingGetPayload,
} from '../../lib/server/financeClosingData.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';

function fakeAppwriteTx({
  $id = 'tx1',
  status = 'settled',
  type = 'plan',
  gross = 100,
  net = 90,
  fee = 10,
  method = 'pix',
  settledAt = '2025-06-15T10:00:00Z',
  $createdAt = '2025-06-15T10:00:00Z',
  competence_month = '',
  academyId = 'acad-1',
} = {}) {
  return {
    $id,
    status,
    type,
    gross,
    net,
    fee,
    method,
    settledAt,
    $createdAt,
    competence_month,
    academyId,
  };
}

function txListCalls() {
  return fcMocks.listDocuments.mock.calls.filter(([, col]) => col === 'col-tx');
}

function closingListCalls() {
  return fcMocks.listDocuments.mock.calls.filter(([, col]) => col === 'col-closing');
}

afterAll(() => {
  for (const k of fcMocks.ENV_KEYS) {
    if (fcMocks.envSnapshot[k] === undefined) delete process.env[k];
    else process.env[k] = fcMocks.envSnapshot[k];
  }
});

describe('financeClosingData integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
    fcMocks.listPaymentsForMonth.mockResolvedValue({ rows: [], truncated: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('BLOCO 1 — getCashClosing', () => {
    // TODO: CASH_CLOSING_COL é lido no load do módulo; com env já setada no hoisted,
    // não dá para testar retorno null sem reimport isolado.
    it.skip('CASH_CLOSING_COL vazio → retorna null sem chamar listDocuments', async () => {});

    it('listDocuments retorna documento → retorna o primeiro documento', async () => {
      const doc = {
        $id: 'close-1',
        academy_id: 'acad-1',
        reference_month: '2025-06',
        closed_at: '2025-06-30T23:59:59Z',
      };
      fcMocks.listDocuments.mockResolvedValueOnce({ documents: [doc] });

      const result = await getCashClosing('acad-1', '2025-06');

      expect(result).toEqual(doc);
      expect(fcMocks.listDocuments).toHaveBeenCalledWith(
        'db-test',
        'col-closing',
        expect.any(Array)
      );
    });

    it('listDocuments retorna lista vazia → retorna null', async () => {
      fcMocks.listDocuments.mockResolvedValueOnce({ documents: [] });

      const result = await getCashClosing('acad-1', '2025-06');

      expect(result).toBeNull();
    });

    it('listDocuments lança erro → retorna null (catch silencioso)', async () => {
      fcMocks.listDocuments.mockRejectedValueOnce(new Error('appwrite down'));

      const result = await getCashClosing('acad-1', '2025-06');

      expect(result).toBeNull();
    });
  });

  describe('BLOCO 2 — listFinancialTxForMonth (regime CASH)', () => {
    it("referenceMonth inválido (ex: 'invalido') → retorna { transactions: [], pendingInMonth: 0 }", async () => {
      const result = await listFinancialTxForMonth('acad-1', 'invalido', FINANCE_REGIME.CASH);

      expect(result).toEqual({ transactions: [], pendingInMonth: 0 });
      expect(fcMocks.listDocuments).not.toHaveBeenCalled();
    });

    it('listDocuments retorna 1 tx settled no mês → transactions com 1 item mapeado (id, não $id)', async () => {
      fcMocks.listDocuments
        .mockResolvedValueOnce({ documents: [fakeAppwriteTx({ $id: 'tx-settled' })] })
        .mockResolvedValueOnce({ documents: [] });

      const result = await listFinancialTxForMonth('acad-1', '2025-06', FINANCE_REGIME.CASH);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('tx-settled');
      expect(result.transactions[0]).not.toHaveProperty('$id');
      expect(result.pendingInMonth).toBe(0);
    });

    it("listDocuments retorna tx fora do mês → transactions vazia", async () => {
      fcMocks.listDocuments
        .mockResolvedValueOnce({
          documents: [fakeAppwriteTx({ settledAt: '2025-07-01T10:00:00Z' })],
        })
        .mockResolvedValueOnce({ documents: [] });

      const result = await listFinancialTxForMonth('acad-1', '2025-06', FINANCE_REGIME.CASH);

      expect(result.transactions).toHaveLength(0);
      expect(result.pendingInMonth).toBe(0);
    });

    it('listDocuments retorna tx cancelled → transactions vazia', async () => {
      fcMocks.listDocuments
        .mockResolvedValueOnce({ documents: [fakeAppwriteTx({ status: 'cancelled' })] })
        .mockResolvedValueOnce({ documents: [] });

      const result = await listFinancialTxForMonth('acad-1', '2025-06', FINANCE_REGIME.CASH);

      expect(result.transactions).toHaveLength(0);
      expect(result.pendingInMonth).toBe(0);
    });

    it('listDocuments retorna tx pending no mês (via segunda fetchBatch) → pendingInMonth=1', async () => {
      fcMocks.listDocuments
        .mockResolvedValueOnce({ documents: [] })
        .mockResolvedValueOnce({
          documents: [
            fakeAppwriteTx({
              $id: 'tx-pending',
              status: 'pending',
              settledAt: '',
              $createdAt: '2025-06-10T10:00:00Z',
            }),
          ],
        });

      const result = await listFinancialTxForMonth('acad-1', '2025-06', FINANCE_REGIME.CASH);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('tx-pending');
      expect(result.pendingInMonth).toBe(1);
    });

    it('paginação: primeira chamada retorna PAGE (200) docs, segunda retorna 0 → listDocuments >= 2x no fetchBatch settled', async () => {
      const pageDocs = Array.from({ length: 200 }, (_, i) =>
        fakeAppwriteTx({ $id: `tx-page-${i}`, settledAt: '2025-06-15T10:00:00Z' })
      );
      fcMocks.listDocuments
        .mockResolvedValueOnce({ documents: pageDocs })
        .mockResolvedValueOnce({ documents: [] })
        .mockResolvedValueOnce({ documents: [] });

      await listFinancialTxForMonth('acad-1', '2025-06', FINANCE_REGIME.CASH);

      expect(txListCalls().length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('BLOCO 3 — loadClosingGetPayload', () => {
    it('sem preloaded → chama tx + payments + closing e retorna payload completo', async () => {
      fcMocks.listDocuments
        .mockResolvedValueOnce({ documents: [] })
        .mockResolvedValueOnce({ documents: [] })
        .mockResolvedValueOnce({ documents: [] });

      const result = await loadClosingGetPayload('acad-1', '2025-06', FINANCE_REGIME.CASH);

      expect(result).toEqual({
        referenceMonth: '2025-06',
        regime: FINANCE_REGIME.CASH,
        payments: [],
        transactions: [],
        pendingInMonth: 0,
        cashClosing: null,
      });
      expect(fcMocks.listPaymentsForMonth).toHaveBeenCalledWith('acad-1', '2025-06');
      expect(fcMocks.listDocuments).toHaveBeenCalled();
    });

    it('com preloaded.payments fornecido → NÃO chama listPaymentsForMonth', async () => {
      fcMocks.listDocuments.mockResolvedValue({ documents: [] });
      const payments = [{ id: 'pay-1', amount: 100 }];

      const result = await loadClosingGetPayload('acad-1', '2025-06', FINANCE_REGIME.CASH, {
        payments,
      });

      expect(fcMocks.listPaymentsForMonth).not.toHaveBeenCalled();
      expect(result.payments).toEqual(payments);
    });

    it('com preloaded.txResult fornecido → NÃO chama listDocuments para tx', async () => {
      fcMocks.listDocuments.mockResolvedValue({ documents: [] });
      const txResult = {
        transactions: [{ id: 'tx-preloaded', status: 'settled' }],
        pendingInMonth: 0,
      };

      const result = await loadClosingGetPayload('acad-1', '2025-06', FINANCE_REGIME.CASH, {
        txResult,
      });

      expect(txListCalls()).toHaveLength(0);
      expect(result.transactions).toEqual(txResult.transactions);
      expect(result.pendingInMonth).toBe(0);
    });

    it('com preloaded.cashClosing=null fornecido → NÃO chama getCashClosing (sem listDocuments closing)', async () => {
      fcMocks.listDocuments
        .mockResolvedValueOnce({ documents: [] })
        .mockResolvedValueOnce({ documents: [] });

      const result = await loadClosingGetPayload('acad-1', '2025-06', FINANCE_REGIME.CASH, {
        cashClosing: null,
      });

      expect(closingListCalls()).toHaveLength(0);
      expect(result.cashClosing).toBeNull();
    });
  });
});
