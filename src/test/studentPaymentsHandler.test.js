import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlerMocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  getDocument: vi.fn(),
  createDocument: vi.fn(),
  recordFinancialAudit: vi.fn(),
  mirrorStudentPaymentToFinancialTx: vi.fn(),
  assertOrRepairStudentInAcademy: vi.fn(),
  syncStudentOverdueAfterPayment: vi.fn(),
  scheduleControlIdOverdueReconcile: vi.fn(),
  isAcademyOwnerOrAdminUser: vi.fn(),
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
  ensureAcademyOwnerOrAdmin: vi.fn(),
  isAcademyOwnerOrAdminUser: handlerMocks.isAcademyOwnerOrAdminUser,
  DB_ID: 'db-test',
  databases: {
    listDocuments: handlerMocks.listDocuments,
    updateDocument: handlerMocks.updateDocument,
    getDocument: handlerMocks.getDocument,
    createDocument: handlerMocks.createDocument,
  },
}));

vi.mock('../../lib/server/friendlyError.js', () => ({
  apiErro: (e) => e?.message || 'erro',
  logApiError: vi.fn(),
}));

vi.mock('../../lib/server/financialAuditLog.js', () => ({
  recordFinancialAudit: handlerMocks.recordFinancialAudit,
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
    handlerMocks.assertOrRepairStudentInAcademy.mockResolvedValue({
      $id: 'lead-1',
      plan: 'Plano legado',
      due_day: 10,
    });
    handlerMocks.mirrorStudentPaymentToFinancialTx.mockResolvedValue({ mirrorId: null, warning: null });
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
});
