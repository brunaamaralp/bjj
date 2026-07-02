import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlerMocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  getDocument: vi.fn(),
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  recordFinancialAudit: vi.fn(),
  mirrorStudentPaymentToFinancialTx: vi.fn(),
  assertOrRepairStudentInAcademy: vi.fn(),
  syncStudentOverdueAfterPayment: vi.fn(),
  scheduleControlIdOverdueReconcile: vi.fn(),
  isAcademyOwnerOrAdminUser: vi.fn(),
  cancelFinancialTxMirrorsForPayment: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (k, v) => ({ op: 'eq', k, v }),
    limit: (n) => ({ op: 'limit', n }),
  },
  ID: { unique: () => 'id-new' },
  Permission: {
    read: () => 'read',
    update: () => 'update',
  },
  Role: {
    users: () => 'users',
  },
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  apiErro: vi.fn(),
  logApiError: vi.fn(),
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  ensureAcademyOwnerOrAdmin: vi.fn().mockResolvedValue(true),
  isAcademyOwnerOrAdminUser: handlerMocks.isAcademyOwnerOrAdminUser,
  DB_ID: 'db-test',
  databases: {
    listDocuments: handlerMocks.listDocuments,
    updateDocument: handlerMocks.updateDocument,
    getDocument: handlerMocks.getDocument,
    createDocument: handlerMocks.createDocument,
    deleteDocument: handlerMocks.deleteDocument,
  },
}));

vi.mock('../../lib/server/friendlyError.js', () => ({
  apiErro: (e) => e?.message || 'erro',
  logApiError: vi.fn(),
}));

vi.mock('../../lib/server/financialAuditLog.js', () => ({
  recordFinancialAudit: handlerMocks.recordFinancialAudit,
}));

vi.mock('../../lib/server/studentPaymentMirrorCancel.js', () => ({
  cancelFinancialTxMirrorsForPayment: handlerMocks.cancelFinancialTxMirrorsForPayment,
}));

vi.mock('../../lib/server/studentPaymentFinancialTxMirror.js', () => ({
  mirrorStudentPaymentToFinancialTx: handlerMocks.mirrorStudentPaymentToFinancialTx,
}));

vi.mock('../../lib/server/studentAcademyRepair.js', () => ({
  assertOrRepairStudentInAcademy: handlerMocks.assertOrRepairStudentInAcademy,
}));

vi.mock('../../lib/server/studentOverdueSync.js', () => ({
  syncStudentOverdueAfterPayment: handlerMocks.syncStudentOverdueAfterPayment,
}));

vi.mock('../../lib/server/controlidOverdueAccess.js', () => ({
  scheduleControlIdOverdueReconcile: handlerMocks.scheduleControlIdOverdueReconcile,
}));

vi.mock('../../lib/server/studentPaymentBundleCreate.js', () => ({
  createBundlePaymentServer: vi.fn(),
  repairBundleCoverageForMonth: vi.fn(),
}));

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('studentPaymentsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlerMocks.listDocuments.mockReset();
    handlerMocks.updateDocument.mockReset();
    handlerMocks.getDocument.mockReset();
    handlerMocks.createDocument.mockReset();
    handlerMocks.assertOrRepairStudentInAcademy.mockResolvedValue({
      $id: 'lead-1',
      plan: 'Plano legado',
      due_day: 10,
    });
    handlerMocks.mirrorStudentPaymentToFinancialTx.mockResolvedValue({ mirrorId: null, warning: null });
    handlerMocks.cancelFinancialTxMirrorsForPayment.mockResolvedValue({ cancelledIds: [], errors: [] });
    handlerMocks.syncStudentOverdueAfterPayment.mockResolvedValue({ updated: false });
    handlerMocks.isAcademyOwnerOrAdminUser.mockResolvedValue(true);
  });

  it('preserva o amount explícito novo ao registrar pagamento sobre um lançamento existente do mês', async () => {
    const prev = {
      $id: 'pay-1',
      lead_id: 'lead-1',
      academy_id: 'acad-1',
      amount: 180,
      expected_amount: 180,
      paid_amount: null,
      status: 'pending',
      method: 'pix',
      account: '',
      plan_name: 'Plano legado',
      reference_month: '2026-06',
      payment_category: 'plan',
      financial_tx_id: '',
    };
    handlerMocks.listDocuments.mockResolvedValueOnce({ documents: [prev] });
    handlerMocks.updateDocument.mockImplementation(async (_db, _col, id, payload) => ({ ...prev, ...payload, $id: id }));
    handlerMocks.getDocument.mockResolvedValue({ ...prev, amount: 180, paid_amount: 220, status: 'paid' });

    const { handleCreateStudentPayment } = await import('../../lib/server/studentPaymentsHandler.js');
    const res = mockRes();

    await handleCreateStudentPayment(
      {
        body: {
          lead_id: 'lead-1',
          amount: 220,
          paid_amount: 220,
          expected_amount: 220,
          method: 'pix',
          status: 'paid',
          reference_month: '2026-06',
          payment_category: 'plan',
        },
      },
      res,
      'acad-1',
      { $id: 'user-1' },
      { financeConfig: '{}' }
    );

    expect(handlerMocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      expect.any(String),
      'pay-1',
      expect.objectContaining({
        amount: 220,
        expected_amount: 220,
        paid_amount: 220,
      })
    );
    expect(res.statusCode).toBe(200);
  });

  it('preserva o amount original no PATCH quando muda apenas o valor pago', async () => {
    const prev = {
      $id: 'pay-2',
      lead_id: 'lead-1',
      academy_id: 'acad-1',
      amount: 180,
      expected_amount: 180,
      paid_amount: null,
      status: 'pending',
      method: 'pix',
      account: '',
      plan_name: 'Plano legado',
      reference_month: '2026-06',
      payment_category: 'plan',
      financial_tx_id: '',
    };
    handlerMocks.getDocument
      .mockResolvedValueOnce(prev)
      .mockResolvedValueOnce({ ...prev, status: 'partial', paid_amount: 90, amount: 180 });
    handlerMocks.listDocuments.mockResolvedValueOnce({ documents: [] });
    handlerMocks.updateDocument.mockImplementation(async (_db, _col, id, payload) => ({ ...prev, ...payload, $id: id }));

    const { handlePatchStudentPayment } = await import('../../lib/server/studentPaymentsHandler.js');
    const res = mockRes();

    await handlePatchStudentPayment(
      {
        query: { id: 'pay-2' },
        body: {
          status: 'partial',
          paid_amount: 90,
        },
      },
      res,
      'acad-1',
      { $id: 'user-1' },
      { financeConfig: '{}' }
    );

    expect(handlerMocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      expect.any(String),
      'pay-2',
      expect.objectContaining({
        amount: 180,
        paid_amount: 90,
      })
    );
    expect(res.statusCode).toBe(200);
  });

  it('preserva amount e expected_amount explícitos iguais a zero no create', async () => {
    handlerMocks.listDocuments.mockResolvedValueOnce({ documents: [] });
    handlerMocks.createDocument.mockImplementation(async (_db, _col, id, payload) => ({
      ...payload,
      $id: id,
    }));
    handlerMocks.getDocument.mockResolvedValue({
      $id: 'pay-3',
      lead_id: 'lead-1',
      academy_id: 'acad-1',
      amount: 0,
      expected_amount: 0,
      paid_amount: 0,
      status: 'paid',
      payment_category: 'plan',
      financial_tx_id: '',
    });

    const { handleCreateStudentPayment } = await import('../../lib/server/studentPaymentsHandler.js');
    const res = mockRes();

    await handleCreateStudentPayment(
      {
        body: {
          lead_id: 'lead-1',
          amount: 0,
          expected_amount: 0,
          paid_amount: 0,
          method: 'pix',
          status: 'paid',
          reference_month: '2026-07',
          payment_category: 'plan',
        },
      },
      res,
      'acad-1',
      { $id: 'user-1' },
      { financeConfig: '{}' }
    );

    expect(handlerMocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      expect.any(String),
      'id-new',
      expect.objectContaining({
        amount: 0,
        expected_amount: 0,
        paid_amount: 0,
      }),
      ['read', 'update']
    );
    expect(res.statusCode).toBe(200);
  });

  it('cria taxa avulsa sem upsert por reference_month', async () => {
    handlerMocks.listDocuments.mockResolvedValueOnce({ documents: [] });
    handlerMocks.createDocument.mockImplementation(async (_db, _col, id, payload) => ({
      ...payload,
      $id: id,
    }));
    handlerMocks.getDocument.mockResolvedValue({
      $id: 'fee-1',
      lead_id: 'lead-1',
      academy_id: 'acad-1',
      amount: 50,
      status: 'paid',
      payment_category: 'fee',
      reference_month: null,
    });

    const { handleCreateStudentPayment } = await import('../../lib/server/studentPaymentsHandler.js');
    const res = mockRes();

    await handleCreateStudentPayment(
      {
        body: {
          lead_id: 'lead-1',
          amount: 50,
          paid_amount: 50,
          method: 'pix',
          status: 'paid',
          paid_at: '2026-06-15T12:00:00.000Z',
          payment_category: 'fee',
          note: 'Taxa competição',
        },
      },
      res,
      'acad-1',
      { $id: 'user-1' },
      { financeConfig: '{}' }
    );

    expect(handlerMocks.createDocument).toHaveBeenCalled();
    expect(handlerMocks.updateDocument).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('desvincula mês covered de pacote ao registrar mensalidade avulsa', async () => {
    const prev = {
      $id: 'child-1',
      lead_id: 'lead-1',
      academy_id: 'acad-1',
      amount: 0,
      status: 'covered',
      method: 'pix',
      account: '',
      plan_name: 'Anual',
      reference_month: '2026-08',
      payment_category: 'bundle',
      bundle_origin_id: 'anchor-1',
    };
    handlerMocks.listDocuments.mockImplementation(async (_db, _col, queries) => {
      const q = JSON.stringify(queries || []);
      if (q.includes('2026-08')) return { documents: [prev] };
      return { documents: [] };
    });
    handlerMocks.updateDocument.mockImplementation(async (_db, _col, id, payload) => ({
      ...prev,
      ...payload,
      $id: id,
    }));
    handlerMocks.getDocument.mockResolvedValue({
      ...prev,
      payment_category: 'plan',
      status: 'paid',
      amount: 200,
      bundle_origin_id: null,
    });

    const { handleCreateStudentPayment } = await import('../../lib/server/studentPaymentsHandler.js');
    const res = mockRes();

    await handleCreateStudentPayment(
      {
        body: {
          lead_id: 'lead-1',
          amount: 200,
          paid_amount: 200,
          method: 'pix',
          status: 'paid',
          reference_month: '2026-08',
          payment_category: 'plan',
        },
      },
      res,
      'acad-1',
      { $id: 'user-1' },
      { financeConfig: '{}' }
    );

    expect(res.statusCode).toBe(200);
    expect(handlerMocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      expect.any(String),
      'child-1',
      expect.objectContaining({
        payment_category: 'plan',
        bundle_origin_id: null,
      })
    );
    expect(handlerMocks.createDocument).not.toHaveBeenCalled();
  });

  it('cancela espelhos (principal + troco) ao estornar sem financial_tx_id', async () => {
    const prev = {
      $id: 'pay-reverse',
      lead_id: 'lead-1',
      academy_id: 'acad-1',
      amount: 200,
      status: 'paid',
      payment_category: 'plan',
      financial_tx_id: '',
    };
    handlerMocks.getDocument
      .mockResolvedValueOnce(prev)
      .mockResolvedValueOnce({ ...prev, status: 'cancelled' });
    handlerMocks.listDocuments.mockResolvedValueOnce({ documents: [] });
    handlerMocks.updateDocument.mockImplementation(async (_db, _col, id, payload) => ({
      ...prev,
      ...payload,
      $id: id,
    }));
    handlerMocks.cancelFinancialTxMirrorsForPayment.mockResolvedValue({
      cancelledIds: ['tx-main', 'tx-troco'],
      errors: [],
    });

    const { handlePatchStudentPayment } = await import('../../lib/server/studentPaymentsHandler.js');
    const res = mockRes();

    await handlePatchStudentPayment(
      { query: { id: 'pay-reverse' }, body: { action: 'reverse' } },
      res,
      'acad-1',
      { $id: 'user-1' },
      { financeConfig: '{}' }
    );

    expect(handlerMocks.cancelFinancialTxMirrorsForPayment).toHaveBeenCalledWith('pay-reverse', {
      explicitTxId: '',
    });
    expect(handlerMocks.mirrorStudentPaymentToFinancialTx).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('cancela espelhos antes de excluir pagamento', async () => {
    const prev = {
      $id: 'pay-del',
      lead_id: 'lead-1',
      academy_id: 'acad-1',
      amount: 150,
      status: 'paid',
      payment_category: 'fee',
      financial_tx_id: 'tx-fee',
    };
    handlerMocks.getDocument.mockResolvedValueOnce(prev);
    handlerMocks.deleteDocument.mockResolvedValueOnce({});
    handlerMocks.cancelFinancialTxMirrorsForPayment.mockResolvedValue({
      cancelledIds: ['tx-fee', 'tx-troco'],
      errors: [],
    });

    const { handleDeleteStudentPayment } = await import('../../lib/server/studentPaymentsHandler.js');
    const res = mockRes();

    await handleDeleteStudentPayment(
      { query: { id: 'pay-del' } },
      res,
      'acad-1',
      { $id: 'user-1' },
      {}
    );

    expect(handlerMocks.cancelFinancialTxMirrorsForPayment).toHaveBeenCalledWith('pay-del', {
      explicitTxId: 'tx-fee',
    });
    expect(handlerMocks.deleteDocument).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});
