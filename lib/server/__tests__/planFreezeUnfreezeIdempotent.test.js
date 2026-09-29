import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  assertOrRepair: vi.fn(),
  addLeadEventServer: vi.fn(),
  extendBundleServer: vi.fn(),
  revertFrozenProjection: vi.fn(),
  controlidSyncLeadServer: vi.fn(),
}));

vi.mock('../studentAcademyRepair.js', () => ({
  assertOrRepairStudentInAcademy: (...args) => mocks.assertOrRepair(...args),
}));

vi.mock('../leadEvents.js', () => ({
  addLeadEventServer: (...args) => mocks.addLeadEventServer(...args),
}));

vi.mock('../runPlanFreezeCron.js', () => ({
  extendBundleServer: (...args) => mocks.extendBundleServer(...args),
}));

vi.mock('../planFreezeProjectionServer.js', () => ({
  materializeFrozenPaymentsInRange: vi.fn(),
  revertFrozenProjection: (...args) => mocks.revertFrozenProjection(...args),
}));

vi.mock('../controlidHandlers.js', () => ({
  controlidSyncLeadServer: (...args) => mocks.controlidSyncLeadServer(...args),
}));

vi.mock('../controlidService.js', () => ({
  configWithPlainPassword: vi.fn(),
  destroyUser: vi.fn(),
}));

vi.mock('../../controlidSettings.js', () => ({
  readControlIdConfig: () => ({ enabled: false }),
  resolveControlIdUserId: () => '',
}));

import { executeUnfreezeServer } from '../planFreezeExecute.js';

describe('executeUnfreezeServer idempotency', () => {
  const databases = {
    getDocument: mocks.getDocument,
    updateDocument: mocks.updateDocument,
    listDocuments: mocks.listDocuments,
    createDocument: mocks.createDocument,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID = 'payments';
    mocks.extendBundleServer.mockResolvedValue({ extended: 0 });
    mocks.revertFrozenProjection.mockResolvedValue({ reverted: 0 });
    mocks.addLeadEventServer.mockResolvedValue(null);
    mocks.listDocuments.mockResolvedValue({ documents: [] });
  });

  it('aluno já destrancado → ok idempotente (não 400)', async () => {
    mocks.assertOrRepair.mockResolvedValue({
      $id: 'stu-1',
      academyId: 'ac-1',
      freeze_status: null,
      freeze_days_used: 10,
      freeze_quota_year: '2026-01-01',
    });

    const out = await executeUnfreezeServer({
      databases,
      dbId: 'db',
      studentsCol: 'students',
      planFreezesCol: 'plan_freezes',
      academiesCol: '',
      academyId: 'ac-1',
      studentId: 'stu-1',
      early: true,
      registeredBy: 'user-1',
    });

    expect(out.ok).toBe(true);
    expect(out.alreadyCleared).toBe(true);
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  it('falha em extensão após clear → ainda retorna ok', async () => {
    mocks.assertOrRepair.mockResolvedValue({
      $id: 'stu-1',
      academyId: 'ac-1',
      freeze_status: 'active',
      freeze_start: '2026-09-01',
      freeze_end: '2026-09-30',
      freeze_days_used: 5,
      freeze_quota_year: '2026-01-01',
      enrollmentDate: '2026-01-01',
      plan: 'Anual',
    });
    mocks.updateDocument.mockResolvedValue({});
    mocks.extendBundleServer.mockRejectedValue(new Error('Unknown attribute: bundle_months'));

    const out = await executeUnfreezeServer({
      databases,
      dbId: 'db',
      studentsCol: 'students',
      planFreezesCol: 'plan_freezes',
      academiesCol: '',
      academyId: 'ac-1',
      studentId: 'stu-1',
      early: true,
      registeredBy: 'user-1',
    });

    expect(out.ok).toBe(true);
    expect(out.alreadyCleared).toBeUndefined();
    expect(mocks.updateDocument).toHaveBeenCalled();
  });
});
