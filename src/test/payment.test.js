import { describe, it, expect, vi, beforeEach } from 'vitest';

const paymentMocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  permissions: vi.fn(() => ['perm-a'])
}));

vi.mock('appwrite', () => ({
  ID: { unique: vi.fn(() => 'id-1') },
  Query: {
    equal: (k, v) => ({ op: 'eq', k, v }),
    limit: (n) => ({ op: 'limit', n }),
    orderDesc: (k) => ({ op: 'desc', k }),
    cursorAfter: (id) => ({ op: 'cursorAfter', id })
  }
}));

vi.mock('../lib/clientDocumentPermissions.js', () => ({
  buildClientDocumentPermissions: paymentMocks.permissions
}));

vi.mock('../store/useLeadStore.js', () => ({
  useLeadStore: {
    getState: () => ({ leads: [{ id: 'lead-1' }] }),
  },
}));

describe('Pagamentos de mensalidade', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    paymentMocks.createDocument.mockReset();
    paymentMocks.listDocuments.mockReset();
    paymentMocks.updateDocument.mockReset();
    paymentMocks.updateDocument.mockResolvedValue({});
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-pay';
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = 'payments-col';
    process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID = '';
  });

  describe('createPayment', () => {
    it('cria documento com campos obrigatórios corretos', async () => {
      paymentMocks.createDocument.mockResolvedValueOnce({ $id: 'pay-1' });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: {
          createDocument: paymentMocks.createDocument,
          listDocuments: paymentMocks.listDocuments,
          updateDocument: paymentMocks.updateDocument
        },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { createPayment } = await import('../lib/studentPayments.js');
      await createPayment({
        lead_id: 'lead-1',
        academy_id: 'acad-1',
        amount: 150,
        method: 'pix',
        status: 'paid',
        reference_month: '2026-04',
        registered_by: 'u1'
      });
      const [, col, , payload] = paymentMocks.createDocument.mock.calls[0];
      expect(col).toBe('payments-col');
      expect(payload.lead_id).toBe('lead-1');
      expect(payload.academy_id).toBe('acad-1');
      expect(payload.amount).toBe(150);
    });

    it('status paid define paid_at e não define due_date', async () => {
      paymentMocks.createDocument.mockResolvedValueOnce({ $id: 'pay-2' });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { createPayment } = await import('../lib/studentPayments.js');
      await createPayment({
        lead_id: 'lead-1',
        academy_id: 'acad-1',
        amount: 150,
        method: 'pix',
        status: 'paid',
        reference_month: '2026-04',
        paid_at: '2026-04-23T12:00:00.000Z',
        due_date: null
      });
      const payload = paymentMocks.createDocument.mock.calls[0][3];
      expect(payload.paid_at).toBe('2026-04-23T12:00:00.000Z');
      expect(payload.due_date).toBeNull();
    });

    it('status pending define due_date e não define paid_at', async () => {
      paymentMocks.createDocument.mockResolvedValueOnce({ $id: 'pay-3' });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { createPayment } = await import('../lib/studentPayments.js');
      await createPayment({
        lead_id: 'lead-1',
        academy_id: 'acad-1',
        amount: 150,
        method: 'pix',
        status: 'pending',
        reference_month: '2026-04',
        due_date: '2026-04-30T12:00:00.000Z',
        paid_at: null
      });
      const payload = paymentMocks.createDocument.mock.calls[0][3];
      expect(payload.due_date).toBe('2026-04-30T12:00:00.000Z');
      expect(payload.paid_at).toBeNull();
    });

    it('lança erro se PAYMENTS_COL não estiver configurado', async () => {
      process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = '';
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { createPayment } = await import('../lib/studentPayments.js');
      await expect(createPayment({})).rejects.toThrow('student_payments_collection_not_configured');
    });

    it('espelho FINANCIAL_TX — erro no espelho não propaga para createPayment', async () => {
      paymentMocks.createDocument
        .mockResolvedValueOnce({ $id: 'pay-10' })
        .mockRejectedValueOnce(new Error('mirror-fail'));
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: 'tx-col'
      }));
      const { createPayment } = await import('../lib/studentPayments.js');
      await expect(
        createPayment({
          lead_id: 'lead-1',
          academy_id: 'acad-1',
          amount: 150,
          method: 'pix',
          status: 'paid',
          reference_month: '2026-04'
        })
      ).resolves.toEqual({ $id: 'pay-10' });
      expect(paymentMocks.updateDocument).not.toHaveBeenCalled();
    });

    it('após espelho FINANCIAL_TX com sucesso, atualiza student_payment com financial_tx_id', async () => {
      paymentMocks.createDocument
        .mockResolvedValueOnce({ $id: 'pay-11' })
        .mockResolvedValueOnce({ $id: 'tx-99' });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: 'tx-col'
      }));
      const { createPayment } = await import('../lib/studentPayments.js');
      await createPayment({
        lead_id: 'lead-1',
        academy_id: 'acad-1',
        amount: 150,
        method: 'pix',
        status: 'paid',
        reference_month: '2026-04'
      });
      expect(paymentMocks.updateDocument).toHaveBeenCalledWith(
        'db-pay',
        'payments-col',
        'pay-11',
        { financial_tx_id: 'tx-99' }
      );
    });

    it('permissions são passadas no createDocument', async () => {
      paymentMocks.createDocument.mockResolvedValueOnce({ $id: 'pay-4' });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { createPayment } = await import('../lib/studentPayments.js');
      await createPayment({
        lead_id: 'lead-1',
        academy_id: 'acad-1',
        amount: 150,
        method: 'pix',
        status: 'paid',
        reference_month: '2026-04',
        registered_by: 'u2',
        team_id: 'team-1'
      });
      expect(paymentMocks.permissions).toHaveBeenCalled();
      expect(paymentMocks.createDocument.mock.calls[0][4]).toEqual(['perm-a']);
    });
  });

  describe('getPaymentStatus', () => {
    it('retorna paid quando existe pagamento do mês com status paid', async () => {
      paymentMocks.listDocuments.mockResolvedValueOnce({ documents: [{ status: 'paid', amount: 10 }] });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { getPaymentStatus } = await import('../lib/studentPayments.js');
      const out = await getPaymentStatus('lead-1', 'acad-1');
      expect(out.status).toBe('paid');
    });

    it('retorna pending quando existe pagamento do mês com status pending', async () => {
      paymentMocks.listDocuments.mockResolvedValueOnce({ documents: [{ status: 'pending', amount: 10 }] });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { getPaymentStatus } = await import('../lib/studentPayments.js');
      const out = await getPaymentStatus('lead-1', 'acad-1');
      expect(out.status).toBe('pending');
    });

    it('retorna none quando não existe pagamento do mês', async () => {
      paymentMocks.listDocuments.mockResolvedValueOnce({ documents: [] });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { getPaymentStatus } = await import('../lib/studentPayments.js');
      const out = await getPaymentStatus('lead-1', 'acad-1');
      expect(out.status).toBe('none');
    });

    it('usa o mês atual (YYYY-MM) na query', async () => {
      paymentMocks.listDocuments.mockResolvedValueOnce({ documents: [] });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { getPaymentStatus } = await import('../lib/studentPayments.js');
      await getPaymentStatus('lead-1', 'acad-1');
      const q = paymentMocks.listDocuments.mock.calls[0][2];
      const monthClause = q.find((x) => x?.op === 'eq' && x.k === 'reference_month');
      expect(monthClause.v).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('getMonthlyPayments', () => {
    it('retorna array vazio se PAYMENTS_COL não configurado', async () => {
      process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = '';
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { getMonthlyPayments } = await import('../lib/studentPayments.js');
      await expect(getMonthlyPayments('acad-1', '2026-04')).resolves.toEqual([]);
    });

    it('filtra por academy_id e reference_month', async () => {
      paymentMocks.listDocuments.mockResolvedValueOnce({ documents: [{ $id: 'p1' }] });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { getMonthlyPayments } = await import('../lib/studentPayments.js');
      await getMonthlyPayments('acad-1', '2026-04');
      const q = paymentMocks.listDocuments.mock.calls[0][2];
      expect(q.some((x) => x?.op === 'eq' && x.k === 'academy_id' && x.v === 'acad-1')).toBe(true);
      expect(q.some((x) => x?.op === 'eq' && x.k === 'reference_month' && x.v === '2026-04')).toBe(true);
    });

    it('usa limite 100 por página e agrega todas as páginas', async () => {
      const batch1 = Array.from({ length: 100 }, (_, i) => ({ $id: `p-${i}` }));
      const batch2 = [{ $id: 'p-end' }];
      paymentMocks.listDocuments
        .mockResolvedValueOnce({ documents: batch1 })
        .mockResolvedValueOnce({ documents: batch2 });
      vi.doMock('../lib/appwrite.js', () => ({
        databases: { createDocument: paymentMocks.createDocument, listDocuments: paymentMocks.listDocuments, updateDocument: paymentMocks.updateDocument },
        DB_ID: 'db-pay',
        FINANCIAL_TX_COL: ''
      }));
      const { getMonthlyPayments } = await import('../lib/studentPayments.js');
      const out = await getMonthlyPayments('acad-1', '2026-04');
      expect(out.length).toBe(101);
      expect(paymentMocks.listDocuments).toHaveBeenCalledTimes(2);
      const q1 = paymentMocks.listDocuments.mock.calls[0][2];
      expect(q1.some((x) => x?.op === 'limit' && x.n === 100)).toBe(true);
      const q2 = paymentMocks.listDocuments.mock.calls[1][2];
      expect(q2.some((x) => x?.op === 'cursorAfter' && x.id === 'p-99')).toBe(true);
    });
  });
});
