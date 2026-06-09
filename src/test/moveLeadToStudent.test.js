import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  getDocument: vi.fn(),
  getLeadById: vi.fn(),
  setLeadState: vi.fn(),
  setStudentState: vi.fn(),
}));

vi.mock('../lib/appwrite.js', () => ({
  databases: {
    createDocument: (...args) => mocks.createDocument(...args),
    deleteDocument: (...args) => mocks.deleteDocument(...args),
    getDocument: (...args) => mocks.getDocument(...args),
  },
  DB_ID: 'db',
  LEADS_COL: 'leads',
  STUDENTS_COL: 'students',
}));

vi.mock('../store/useLeadStore.js', () => ({
  useLeadStore: {
    getState: () => ({
      getLeadById: mocks.getLeadById,
      leads: [],
      academyId: 'academy-1',
    }),
    setState: (fn) => mocks.setLeadState(fn),
  },
}));

vi.mock('../store/useStudentStore.js', () => ({
  useStudentStore: {
    setState: (fn) => mocks.setStudentState(fn),
  },
}));

describe('moveLeadToStudent rollback', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createDocument.mockReset();
    mocks.deleteDocument.mockReset();
    mocks.getLeadById.mockReturnValue({
      id: 'lead-1',
      name: 'João',
      phone: '11999998888',
      createdAt: '2026-01-01',
    });
    mocks.createDocument.mockResolvedValue({ $id: 'lead-1' });
    mocks.deleteDocument.mockImplementation((_db, col) => {
      if (col === 'leads') return Promise.reject(new Error('delete lead failed'));
      return Promise.resolve();
    });
  });

  it('grava academyId do contexto quando o lead da UI não traz academia', async () => {
    mocks.deleteDocument.mockResolvedValue(undefined);
    const { moveLeadToStudent } = await import('../lib/moveLeadToStudent.js');

    await moveLeadToStudent({ leadId: 'lead-1' });

    expect(mocks.createDocument).toHaveBeenCalledWith(
      'db',
      'students',
      'lead-1',
      expect.objectContaining({ academyId: 'academy-1' }),
      undefined
    );
  });

  it('remove student criado quando delete do lead falha', async () => {
    const { moveLeadToStudent } = await import('../lib/moveLeadToStudent.js');

    await expect(moveLeadToStudent({ leadId: 'lead-1' })).rejects.toThrow('enrollment_rollback_failed');

    expect(mocks.createDocument).toHaveBeenCalledWith('db', 'students', 'lead-1', expect.any(Object), undefined);
    expect(mocks.deleteDocument).toHaveBeenCalledWith('db', 'leads', 'lead-1');
    expect(mocks.deleteDocument).toHaveBeenCalledWith('db', 'students', 'lead-1');
  });
});
