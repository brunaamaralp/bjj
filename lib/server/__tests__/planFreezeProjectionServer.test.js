import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  recordFinancialAudit: vi.fn(),
  fetchActiveFreezesForStudent: vi.fn(),
}));

vi.mock('../planFreezeLookup.js', () => ({
  fetchActiveFreezesForStudent: (...args) => mocks.fetchActiveFreezesForStudent(...args),
}));

vi.mock('../financialAuditLog.js', () => ({
  recordFinancialAudit: (...args) => mocks.recordFinancialAudit(...args),
}));

import { revertFrozenProjection } from '../planFreezeProjectionServer.js';

const DB = 'db-test';
const COL = 'student_payments';

describe('revertFrozenProjection', () => {
  const databases = {
    listDocuments: mocks.listDocuments,
    updateDocument: mocks.updateDocument,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = COL;
    mocks.fetchActiveFreezesForStudent.mockResolvedValue([
      {
        $id: 'fr-1',
        start_date: '2026-01-15T12:00:00.000Z',
        end_date: '2026-04-30T12:00:00.000Z',
      },
    ]);
    mocks.listDocuments.mockResolvedValue({
      documents: [
        { $id: 'sp-jan', reference_month: '2026-01', status: 'frozen', note: 'Trancamento — 2026-01' },
        { $id: 'sp-feb', reference_month: '2026-02', status: 'frozen', note: 'Trancamento — 2026-02' },
        { $id: 'sp-mar', reference_month: '2026-03', status: 'frozen', covered_reason: 'freeze' },
        { $id: 'sp-apr', reference_month: '2026-04', status: 'frozen' },
        { $id: 'sp-may', reference_month: '2026-05', status: 'frozen' },
        { $id: 'sp-paid', reference_month: '2026-06', status: 'paid' },
      ],
    });
    mocks.updateDocument.mockImplementation(async (_db, _col, id, patch) => ({ $id: id, ...patch }));
    mocks.recordFinancialAudit.mockResolvedValue(undefined);
  });

  it('destrancamento em março: abril+ revertem, março permanece frozen', async () => {
    const out = await revertFrozenProjection({
      databases,
      dbId: DB,
      planFreezesCol: 'plan_freezes',
      leadId: 'stu-1',
      academyId: 'ac-1',
      unfreezeYmd: '2026-03-20',
      freezeStartYmd: '2026-01-15',
      freezeEndYmd: '2026-04-30',
      userId: 'user-1',
    });

    expect(out.reverted).toBe(1);
    const revertedIds = mocks.updateDocument.mock.calls
      .filter((c) => c[1] === COL)
      .map((c) => c[2]);
    expect(revertedIds).toContain('sp-apr');
    expect(revertedIds).not.toContain('sp-mar');
    expect(revertedIds).not.toContain('sp-jan');
    expect(revertedIds).not.toContain('sp-feb');
    expect(revertedIds).not.toContain('sp-may');

    expect(mocks.recordFinancialAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'payment_update',
        previous_status: 'frozen',
        new_status: 'pending',
        meta: expect.objectContaining({
          changes: { status: { from: 'frozen', to: 'pending' } },
        }),
      })
    );

    expect(mocks.updateDocument).toHaveBeenCalledWith(
      DB,
      'plan_freezes',
      'fr-1',
      expect.objectContaining({ end_date: '2026-03-20T12:00:00.000Z' })
    );
  });
});
