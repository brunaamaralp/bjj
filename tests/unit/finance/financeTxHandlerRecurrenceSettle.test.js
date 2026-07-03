import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE } from '../../../lib/constants.js';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  updateDocumentResilient: vi.fn(),
  createDocumentResilient: vi.fn(),
  listFinancialTxPage: vi.fn(),
  recordFinancialAudit: vi.fn(),
  applyAccountingSideEffectsAutoServer: vi.fn(),
  notifyFinanceHubDataChanged: vi.fn(),
  resolvePayableInstanceForSettle: vi.fn(),
}));

vi.mock('../../../lib/server/academyAccess.js', () => ({
  ensureAuth: vi.fn().mockResolvedValue({ $id: 'user-1', name: 'Test' }),
  ensureAcademyAccess: vi.fn().mockResolvedValue({ academyId: 'acad-gblp', doc: { ownerId: 'user-1' } }),
  isAcademyOwnerOrAdminUser: vi.fn().mockResolvedValue(true),
  DB_ID: 'db-test',
  databases: {
    getDocument: (...args) => mocks.getDocument(...args),
    updateDocument: vi.fn(),
    listDocuments: vi.fn(),
  },
}));

vi.mock('../../../lib/server/financialAuditLog.js', () => ({
  recordFinancialAudit: (...args) => mocks.recordFinancialAudit(...args),
}));

vi.mock('../../../lib/server/financeTxQuery.js', () => ({
  listFinancialTxPage: (...args) => mocks.listFinancialTxPage(...args),
}));

vi.mock('../../../lib/server/financeJournalServer.js', () => ({
  applyAccountingSideEffectsAutoServer: (...args) => mocks.applyAccountingSideEffectsAutoServer(...args),
}));

vi.mock('../../../lib/server/financeHubServerInvalidate.js', () => ({
  notifyFinanceHubDataChanged: (...args) => mocks.notifyFinanceHubDataChanged(...args),
}));

vi.mock('../../../lib/server/appwriteSchemaResilient.js', () => ({
  createDocumentResilient: (...args) => mocks.createDocumentResilient(...args),
  updateDocumentResilient: (...args) => mocks.updateDocumentResilient(...args),
}));

vi.mock('../../../lib/server/financeTxLeadEnrichment.js', () => ({
  enrichTransactionsWithLeadNames: vi.fn(async (_db, _aid, txs) => txs),
  enrichTransactionWithLeadName: vi.fn(async (_db, _aid, tx) => tx),
}));

vi.mock('../../../lib/server/academyEvents.js', () => ({
  recordAcademyEvent: vi.fn(),
  FINANCE_RECURRENCE_EVENT_TYPES: { CREATED: 'created', CANCELLED: 'cancelled', GENERATED: 'generated' },
}));

vi.mock('../../../lib/server/financeRecurrenceInstance.js', () => ({
  ensureInitialPayableInstance: vi.fn(),
  resolvePayableInstanceForSettle: (...args) => mocks.resolvePayableInstanceForSettle(...args),
}));

import { handleCreateFinanceTx, handlePatchFinanceTx } from '../../../lib/server/financeTxHandler.js';

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

const role = { isAdmin: true };
const me = { $id: 'user-1', name: 'Test' };
const academyDoc = {};

const templateSalarios = {
  $id: '6a3449a300308a6c2861',
  academyId: 'acad-gblp',
  status: 'pending',
  is_recurrence_template: true,
  recurrence_type: 'monthly',
  recurrence_day: 5,
  gross: 7100,
  type: 'expense_operational',
  direction: 'out',
  due_date: '2026-06-05',
  category: 'Salários',
};

const instanceSalarios = {
  $id: '6a3449a4002bff3601df',
  academyId: 'acad-gblp',
  status: 'pending',
  is_recurrence_template: false,
  recurrence_origin_id: '6a3449a300308a6c2861',
  competence_month: '2026-06',
  gross: 7100,
  type: 'expense_operational',
  direction: 'out',
  due_date: '2026-06-05',
};

describe('financeTxHandler recurrence settle guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateDocumentResilient.mockImplementation(async (_db, _dbId, _col, id, patch) => ({
      $id: id,
      academyId: 'acad-gblp',
      ...patch,
      gross: 7100,
      type: 'expense_operational',
      direction: 'out',
      is_recurrence_template: false,
      recurrence_origin_id: '6a3449a300308a6c2861',
    }));
  });

  it('settle_rejeita_template: action settle em template não grava settled', async () => {
    mocks.getDocument.mockResolvedValue({ ...templateSalarios });

    const req = {
      query: { id: templateSalarios.$id },
      body: { action: 'settle', method: 'pix' },
    };
    const res = mockRes();

    await handlePatchFinanceTx(req, res, 'acad-gblp', me, academyDoc, role);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe(FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE);
    expect(mocks.updateDocumentResilient).not.toHaveBeenCalled();
  });

  it('settle_aceita_instancia: instância com recurrence_origin_id continua liquidando', async () => {
    mocks.getDocument.mockResolvedValue({ ...instanceSalarios });

    const req = {
      query: { id: instanceSalarios.$id },
      body: { action: 'settle', method: 'pix', bank_account: 'Sicoob' },
    };
    const res = mockRes();

    await handlePatchFinanceTx(req, res, 'acad-gblp', me, academyDoc, role);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mocks.updateDocumentResilient).toHaveBeenCalledWith(
      expect.anything(),
      'db-test',
      expect.any(String),
      instanceSalarios.$id,
      expect.objectContaining({ status: 'settled' })
    );
  });

  it('create_rejeita_template_liquidado: receive_now em template é bloqueado', async () => {
    const req = {
      body: {
        type: 'expense_operational',
        category: 'Salários',
        gross: 7100,
        direction: 'out',
        is_recurrence_template: true,
        recurrence_type: 'monthly',
        recurrence_day: 5,
        receive_now: true,
        due_date: '2026-06-05',
        planName: 'Salários',
      },
    };
    const res = mockRes();

    await handleCreateFinanceTx(req, res, 'acad-gblp', me, academyDoc, role);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe(FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE);
    expect(mocks.createDocumentResilient).not.toHaveBeenCalled();
  });

  it('reproduz_o_bug_de_junho: liquidar template Salários 7100 via settle é bloqueado', async () => {
    const academyId = '699f21b70006985daa90';
    mocks.getDocument.mockResolvedValue({
      ...templateSalarios,
      academyId,
      method: 'pix',
      note: 'Atualizar com o valor devidamente pago',
    });

    const req = {
      query: { id: '6a3449a300308a6c2861' },
      body: {
        action: 'settle',
        gross: 7100,
        method: 'pix',
        settledAt: '2026-06-29T21:24:00.000Z',
      },
    };
    const res = mockRes();

    await handlePatchFinanceTx(req, res, academyId, me, academyDoc, role);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe(FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE);
    expect(mocks.updateDocumentResilient).not.toHaveBeenCalled();
  });

  it('settle_payable_from_template liquida instância, não o template', async () => {
    mocks.getDocument.mockResolvedValue({ ...templateSalarios });
    mocks.resolvePayableInstanceForSettle.mockResolvedValue({ ...instanceSalarios });

    const req = {
      query: { id: templateSalarios.$id },
      body: {
        action: 'settle_payable_from_template',
        payable_due_date: '2026-06-05',
        method: 'pix',
        bank_account: 'Sicoob',
        gross: 7100,
      },
    };
    const res = mockRes();

    await handlePatchFinanceTx(req, res, 'acad-gblp', me, academyDoc, role);

    expect(res.statusCode).toBe(200);
    expect(mocks.resolvePayableInstanceForSettle).toHaveBeenCalled();
    expect(mocks.updateDocumentResilient).toHaveBeenCalledWith(
      expect.anything(),
      'db-test',
      expect.any(String),
      instanceSalarios.$id,
      expect.objectContaining({ status: 'settled' })
    );
    expect(mocks.updateDocumentResilient).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      templateSalarios.$id,
      expect.anything()
    );
  });
});
