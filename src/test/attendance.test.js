import { describe, it, expect, vi, beforeEach } from 'vitest';

const attendanceMocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  listDocuments: vi.fn(),
  permissions: vi.fn(() => ['perm-x'])
}));

vi.mock('appwrite', () => ({
  ID: { unique: vi.fn(() => 'check-1') },
  Query: {
    equal: (k, v) => ({ op: 'eq', k, v }),
    orderDesc: (k) => ({ op: 'desc', k }),
    limit: (n) => ({ op: 'limit', n })
  }
}));

vi.mock('../lib/appwrite.js', () => ({
  databases: {
    createDocument: attendanceMocks.createDocument,
    listDocuments: attendanceMocks.listDocuments
  },
  DB_ID: 'db-att'
}));

vi.mock('../lib/clientDocumentPermissions.js', () => ({
  buildClientDocumentPermissions: attendanceMocks.permissions
}));

describe('Registro de presença', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.VITE_APPWRITE_ATTENDANCE_COL_ID = 'attendance-col';
  });

  describe('createCheckin', () => {
    it('cria documento com lead_id, academy_id e checked_in_at', async () => {
      attendanceMocks.createDocument.mockResolvedValueOnce({ $id: 'c1' });
      const { createCheckin } = await import('../lib/attendance.js');
      await createCheckin({ lead_id: 'lead-1', academy_id: 'acad-1', checked_in_by: 'u1', checked_in_by_name: 'Ana' });
      const payload = attendanceMocks.createDocument.mock.calls[0][3];
      expect(payload.lead_id).toBe('lead-1');
      expect(payload.academy_id).toBe('acad-1');
      expect(typeof payload.checked_in_at).toBe('string');
    });

    it('source padrão é manual', async () => {
      attendanceMocks.createDocument.mockResolvedValueOnce({ $id: 'c2' });
      const { createCheckin } = await import('../lib/attendance.js');
      await createCheckin({ lead_id: 'lead-1', academy_id: 'acad-1', checked_in_by: 'u1', checked_in_by_name: 'Ana' });
      const payload = attendanceMocks.createDocument.mock.calls[0][3];
      expect(payload.source).toBe('manual');
    });

    it('checked_in_at é uma data ISO válida', async () => {
      attendanceMocks.createDocument.mockResolvedValueOnce({ $id: 'c3' });
      const { createCheckin } = await import('../lib/attendance.js');
      await createCheckin({ lead_id: 'lead-1', academy_id: 'acad-1', checked_in_by: 'u1', checked_in_by_name: 'Ana' });
      const payload = attendanceMocks.createDocument.mock.calls[0][3];
      expect(Number.isNaN(new Date(payload.checked_in_at).getTime())).toBe(false);
    });

    it('permissions são passadas no createDocument', async () => {
      attendanceMocks.createDocument.mockResolvedValueOnce({ $id: 'c4' });
      const { createCheckin } = await import('../lib/attendance.js');
      await createCheckin(
        { lead_id: 'lead-1', academy_id: 'acad-1', checked_in_by: 'u1', checked_in_by_name: 'Ana' },
        { teamId: 'team-1', userId: 'u1' }
      );
      expect(attendanceMocks.permissions).toHaveBeenCalled();
      expect(attendanceMocks.createDocument.mock.calls[0][4]).toEqual(['perm-x']);
    });
  });

  describe('getAttendanceStats', () => {
    it('conta corretamente presenças do mês atual', async () => {
      const now = new Date();
      const thisIso = new Date(now.getFullYear(), now.getMonth(), 10, 12).toISOString();
      attendanceMocks.listDocuments.mockResolvedValueOnce({ documents: [{ checked_in_at: thisIso }], total: 1 });
      const { getAttendanceStats } = await import('../lib/attendance.js');
      const out = await getAttendanceStats('lead-1', 'acad-1');
      expect(out.thisMonth).toBe(1);
    });

    it('conta corretamente presenças do mês anterior', async () => {
      const now = new Date();
      const prevIso = new Date(now.getFullYear(), now.getMonth() - 1, 10, 12).toISOString();
      attendanceMocks.listDocuments.mockResolvedValueOnce({ documents: [{ checked_in_at: prevIso }], total: 1 });
      const { getAttendanceStats } = await import('../lib/attendance.js');
      const out = await getAttendanceStats('lead-1', 'acad-1');
      expect(out.lastMonth).toBe(1);
    });

    it('total é a soma de todos os registros', async () => {
      const now = new Date();
      const thisIso = new Date(now.getFullYear(), now.getMonth(), 2, 12).toISOString();
      const prevIso = new Date(now.getFullYear(), now.getMonth() - 1, 5, 12).toISOString();
      attendanceMocks.listDocuments.mockResolvedValueOnce({
        documents: [{ checked_in_at: thisIso }, { checked_in_at: prevIso }],
        total: 2
      });
      const { getAttendanceStats } = await import('../lib/attendance.js');
      const out = await getAttendanceStats('lead-1', 'acad-1');
      expect(out.total).toBe(2);
    });

    it('retorna zeros quando não há registros', async () => {
      attendanceMocks.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const { getAttendanceStats } = await import('../lib/attendance.js');
      const out = await getAttendanceStats('lead-1', 'acad-1');
      expect(out).toEqual({ thisMonth: 0, lastMonth: 0, total: 0, monthlyRate: '0%' });
    });
  });
});
