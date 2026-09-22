import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.stubEnv('VITE_APPWRITE_DATABASE_ID', 'db1');
vi.stubEnv('APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID', 'note_notifications');

describe('profileNoteNotify', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('truncates body to max with ellipsis', async () => {
    const { truncateNotificationBody, PROFILE_NOTE_BODY_MAX } = await import(
      '../../lib/server/profileNoteNotify.js'
    );
    const long = 'a'.repeat(PROFILE_NOTE_BODY_MAX + 40);
    const out = truncateNotificationBody(long);
    expect(out.length).toBe(PROFILE_NOTE_BODY_MAX);
    expect(out.endsWith('…')).toBe(true);
  });

  it('keeps short body intact', async () => {
    const { truncateNotificationBody } = await import('../../lib/server/profileNoteNotify.js');
    expect(truncateNotificationBody('  Olá equipe  ')).toBe('Olá equipe');
  });

  it('builds student and lead action urls', async () => {
    const { buildProfileNoteActionUrl } = await import('../../lib/server/profileNoteNotify.js');
    expect(buildProfileNoteActionUrl({ personKind: 'student', personId: 's1' })).toBe(
      '/student/s1?tab=timeline'
    );
    expect(buildProfileNoteActionUrl({ personKind: 'lead', personId: 'l1' })).toBe(
      '/lead/l1?tab=timeline'
    );
  });

  it('creates broadcast notification with author in read_by and profile_note type', async () => {
    const { createProfileNoteNotification, PROFILE_NOTE_NOTIFICATION_TYPE } = await import(
      '../../lib/server/profileNoteNotify.js'
    );
    const createDocument = vi.fn().mockResolvedValue({ $id: 'n1' });
    const databases = { createDocument };
    const result = await createProfileNoteNotification(databases, {
      academyId: 'acad-1',
      noteId: 'ev-1',
      leadId: 'stu-1',
      leadName: 'João Silva',
      body: 'Aluno pediu para alterar o vencimento para dia 10.',
      createdByUserId: 'user-bruna',
      createdByName: 'Bruna',
      actionUrl: '/student/stu-1?tab=timeline',
    });
    expect(result.ok).toBe(true);
    expect(createDocument).toHaveBeenCalled();
    const payload = createDocument.mock.calls[0][3];
    expect(payload.type).toBe(PROFILE_NOTE_NOTIFICATION_TYPE);
    expect(payload.academy_id).toBe('acad-1');
    expect(payload.note_id).toBe('ev-1');
    expect(payload.lead_id).toBe('stu-1');
    expect(payload.read_by).toEqual(['user-bruna']);
    expect(payload.body).toContain('vencimento');
    expect(payload.action_url).toBe('/student/stu-1?tab=timeline');
  });
});
