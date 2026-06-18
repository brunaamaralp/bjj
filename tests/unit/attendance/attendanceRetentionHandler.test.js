import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  listDocuments: vi.fn(),
}));

vi.mock('../../../lib/server/academyAccess.js', () => ({
  ensureAuth: (...args) => mocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => mocks.ensureAcademyAccess(...args),
  DB_ID: 'db-test',
  databases: {
    listDocuments: (...args) => mocks.listDocuments(...args),
  },
}));

describe('attendanceRetentionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_APPWRITE_STUDENTS_COLLECTION_ID', 'students-col');
    vi.stubEnv('VITE_APPWRITE_ATTENDANCE_COL_ID', 'attendance-col');
    mocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    mocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'ac-1' });
  });

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

  it('rejeita método não GET', async () => {
    const handler = (await import('../../../lib/server/attendanceRetentionHandler.js')).default;
    const res = mockRes();
    await handler({ method: 'POST', query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('retorna summary e at_risk', async () => {
    mocks.listDocuments
      .mockResolvedValueOnce({
        documents: [
          {
            $id: 'stu-1',
            name: 'Ana',
            phone: '11999999999',
            enrollmentDate: '2026-01-01',
            student_status: 'active',
            contact_type: 'student',
            academyId: 'ac-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        documents: [{ student_id: 'stu-1', checked_in_at: '2026-06-01T10:00:00.000Z' }],
      });

    const handler = (await import('../../../lib/server/attendanceRetentionHandler.js')).default;
    const res = mockRes();
    await handler({ method: 'GET', query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.summary.eligible).toBe(1);
    expect(res.body.summary.absent).toBe(1);
    expect(res.body.at_risk).toHaveLength(1);
    expect(res.body.at_risk[0].name).toBe('Ana');
  });

  it('faz fallback quando select inclui atributo inexistente', async () => {
    mocks.listDocuments
      .mockRejectedValueOnce(new Error('Attribute not found in schema: class_name'))
      .mockResolvedValueOnce({
        documents: [
          {
            $id: 'stu-1',
            name: 'Ana',
            enrollmentDate: '2026-01-01',
            student_status: 'active',
            academyId: 'ac-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        documents: [{ student_id: 'stu-1', checked_in_at: '2026-06-01T10:00:00.000Z' }],
      });

    const handler = (await import('../../../lib/server/attendanceRetentionHandler.js')).default;
    const res = mockRes();
    await handler({ method: 'GET', query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mocks.listDocuments).toHaveBeenCalledTimes(3);
  });
});
