import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  syncStudentOverdueAfterPayment: vi.fn(),
  scheduleControlIdOverdueReconcile: vi.fn(),
  recordFinancialAudit: vi.fn(),
  findStudentPaymentForMonth: vi.fn(),
  findStudentPaymentByGatewayPaymentId: vi.fn(),
  findStudentPaymentByBillingReference: vi.fn(),
}));

vi.mock('./studentOverdueSync.js', () => ({
  syncStudentOverdueAfterPayment: (...args) => mocks.syncStudentOverdueAfterPayment(...args),
}));

vi.mock('./controlidOverdueAccess.js', () => ({
  scheduleControlIdOverdueReconcile: (...args) => mocks.scheduleControlIdOverdueReconcile(...args),
}));

vi.mock('../financialAuditLog.js', () => ({
  recordFinancialAudit: (...args) => mocks.recordFinancialAudit(...args),
}));

vi.mock('../studentPaymentLookup.js', () => ({
  findStudentPaymentForMonth: (...args) => mocks.findStudentPaymentForMonth(...args),
  findStudentPaymentByGatewayPaymentId: (...args) => mocks.findStudentPaymentByGatewayPaymentId(...args),
  findStudentPaymentByBillingReference: (...args) => mocks.findStudentPaymentByBillingReference(...args),
}));

import {
  centsToReais,
  resolveDueDateForReferenceMonth,
  upsertStudentPaymentFromPagbank,
} from '../upsertStudentPaymentFromPagbank.js';

const DB = 'db-test';
const COL = 'student_payments';

describe('centsToReais', () => {
  it('converte centavos PagBank para reais', () => {
    expect(centsToReais(15000)).toBe(150);
    expect(centsToReais(99)).toBe(0.99);
  });
});

describe('resolveDueDateForReferenceMonth', () => {
  it('usa due_day do aluno no mês de referência', () => {
    const due = resolveDueDateForReferenceMonth({ due_day: 10 }, '2026-03');
    expect(due).toMatch(/^2026-03-10$/);
  });
});

describe('upsertStudentPaymentFromPagbank', () => {
  const databases = () => ({
    listDocuments: mocks.listDocuments,
    createDocument: mocks.createDocument,
    updateDocument: mocks.updateDocument,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = COL;
    mocks.createDocument.mockResolvedValue({ $id: 'sp-new', status: 'paid' });
    mocks.updateDocument.mockImplementation(async (_db, _col, id, patch) => ({
      $id: id,
      ...patch,
    }));
    mocks.findStudentPaymentForMonth.mockResolvedValue(null);
    mocks.findStudentPaymentByGatewayPaymentId.mockResolvedValue(null);
    mocks.findStudentPaymentByBillingReference.mockResolvedValue(null);
    mocks.recordFinancialAudit.mockResolvedValue(undefined);
  });

  it('sem registro no mês → cria paid em reais com campos gateway', async () => {
    const out = await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      financialTxId: 'tx-1',
      paidAt: '2026-03-05T10:00:00.000Z',
      status: 'paid',
      studentDoc: { plan: 'Adulto Mensal' },
      gatewayPaymentId: 'PAY_NEW',
      gatewayProvider: 'pagbank',
    });

    expect(out.created).toBe(true);
    expect(mocks.createDocument).toHaveBeenCalledWith(
      DB,
      COL,
      expect.any(String),
      expect.objectContaining({
        lead_id: 'stu-1',
        status: 'paid',
        amount: 150,
        paid_amount: 150,
        method: 'pagbank',
        payment_category: 'plan',
        financial_tx_id: 'tx-1',
        gateway_payment_id: 'PAY_NEW',
        gateway_provider: 'pagbank',
        billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-03',
        issued_at: expect.any(String),
      })
    );
  });

  // Contrato novo: liquidação parcial — não envia amount/expected_amount no patch.
  it('pending existente → liquida sem sobrescrever expected_amount', async () => {
    mocks.findStudentPaymentForMonth.mockResolvedValue({
      $id: 'sp-pend',
      status: 'pending',
      payment_category: 'plan',
      expected_amount: 100,
      reference_month: '2026-03',
      billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-03',
    });

    const out = await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      financialTxId: 'tx-2',
      paidAt: '2026-03-05T10:00:00.000Z',
      status: 'paid',
      gatewayPaymentId: 'PAY_LIQ',
      resolutionMethod: 'heuristic_fallback',
    });

    expect(out.liquidated).toBe(true);
    const patch = mocks.updateDocument.mock.calls[0][3];
    expect(patch).toEqual(
      expect.objectContaining({
        status: 'paid',
        paid_amount: 150,
        method: 'pagbank',
        gateway_payment_id: 'PAY_LIQ',
      })
    );
    expect(patch).not.toHaveProperty('amount');
    expect(patch).not.toHaveProperty('expected_amount');
    expect(patch).not.toHaveProperty('reference_month');
    expect(patch).not.toHaveProperty('billing_reference_id');
    expect(mocks.recordFinancialAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'payment_update',
        meta: expect.objectContaining({
          resolution_method: 'heuristic_fallback',
          changes: { paid_vs_expected: { from: 100, to: 150 } },
        }),
      })
    );
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it('replay exato (mesmo gateway_payment_id) → skip, zero escritas', async () => {
    mocks.findStudentPaymentByGatewayPaymentId.mockResolvedValue({
      $id: 'sp-replay',
      status: 'paid',
      gateway_payment_id: 'PAY_SAME',
    });

    const out = await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      status: 'paid',
      gatewayPaymentId: 'PAY_SAME',
    });

    expect(out).toMatchObject({ skipped: true, reason: 'gateway_replay', doc: { $id: 'sp-replay' } });
    expect(mocks.updateDocument).not.toHaveBeenCalled();
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it('paid sobre paid com gateway IDs diferentes → anomalia, doc intacto', async () => {
    mocks.findStudentPaymentForMonth.mockResolvedValue({
      $id: 'sp-paid',
      status: 'paid',
      gateway_payment_id: 'PAY_OLD',
      expected_amount: 150,
      reference_month: '2026-03',
    });

    const out = await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      status: 'paid',
      gatewayPaymentId: 'PAY_NEW',
      resolutionMethod: 'billing_reference',
    });

    expect(out).toMatchObject({ skipped: true, reason: 'settled_conflict' });
    expect(mocks.updateDocument).not.toHaveBeenCalled();
    expect(mocks.createDocument).not.toHaveBeenCalled();
    expect(mocks.recordFinancialAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'gateway_payment_conflict',
        meta: expect.objectContaining({
          severity: 'warning',
          existing_gateway_payment_id: 'PAY_OLD',
          incoming_gateway_payment_id: 'PAY_NEW',
        }),
      })
    );
  });

  it('409 no create (corrida UNIQUE) → replay idempotente', async () => {
    const raceErr = Object.assign(new Error('document_already_exists'), { code: 409 });
    mocks.createDocument.mockRejectedValueOnce(raceErr);
    mocks.findStudentPaymentByGatewayPaymentId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ $id: 'sp-race', gateway_payment_id: 'PAY_RACE' });

    const out = await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      status: 'paid',
      gatewayPaymentId: 'PAY_RACE',
    });

    expect(out).toMatchObject({ skipped: true, reason: 'gateway_replay', doc: { $id: 'sp-race' } });
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  it('falha definitiva sem registro → cria pending com due_date', async () => {
    await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      financialTxId: null,
      paidAt: null,
      status: 'pending',
      studentDoc: { due_day: 5 },
    });

    expect(mocks.createDocument).toHaveBeenCalledWith(
      DB,
      COL,
      expect.any(String),
      expect.objectContaining({
        status: 'pending',
        due_date: '2026-03-05',
        paid_at: null,
      })
    );
  });

  it('falha definitiva com paid existente → não sobrescreve com pending (regressão)', async () => {
    mocks.findStudentPaymentForMonth.mockResolvedValue({
      $id: 'sp-paid',
      status: 'paid',
      payment_category: 'plan',
    });

    const out = await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      financialTxId: null,
      paidAt: null,
      status: 'pending',
    });

    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('already_settled');
    expect(mocks.updateDocument).not.toHaveBeenCalled();
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it('pending sobre pending → atualiza só metadados gateway ausentes', async () => {
    mocks.findStudentPaymentForMonth.mockResolvedValue({
      $id: 'sp-pend',
      status: 'pending',
      payment_category: 'plan',
    });

    const out = await upsertStudentPaymentFromPagbank({
      databases: databases(),
      dbId: DB,
      academyId: 'ac-1',
      studentId: 'stu-1',
      referenceMonth: '2026-03',
      amount: 15000,
      status: 'pending',
      gatewayPaymentId: 'PAY_META',
    });

    expect(out.metadata_only).toBe(true);
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      DB,
      COL,
      'sp-pend',
      expect.objectContaining({
        gateway_payment_id: 'PAY_META',
        gateway_provider: 'pagbank',
      })
    );
  });
});
