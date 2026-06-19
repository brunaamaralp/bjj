import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/appwrite', () => ({
  databases: {
    listDocuments: vi.fn(),
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
  DB_ID: 'db-test',
  CLASSES_COL: 'classes',
  SCHEDULES_COL: 'schedules',
}));

vi.mock('../lib/academyContext.js', () => ({
  permissionContextFromAcademy: vi.fn(() => ({ teamId: 'team-1', userId: 'user-1' })),
}));

describe('classesStore', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('deleteClass blocks when schedules are linked', async () => {
    const { databases } = await import('../lib/appwrite');
    databases.listDocuments.mockResolvedValue({ total: 2, documents: [{ $id: 'sch1' }] });

    const { useClassesStore } = await import('../store/classesStore.js');
    useClassesStore.setState({
      classes: [{ id: 'class-1', name: 'Adulto', academy_id: 'acad1' }],
    });

    await expect(useClassesStore.getState().deleteClass('class-1')).rejects.toMatchObject({
      code: 'class_has_schedules',
      linkedSchedules: 2,
    });
    expect(databases.deleteDocument).not.toHaveBeenCalled();
    expect(useClassesStore.getState().classes).toHaveLength(1);
  });

  it('deleteClass removes turma when no schedules are linked', async () => {
    const { databases } = await import('../lib/appwrite');
    databases.listDocuments.mockResolvedValue({ total: 0, documents: [] });
    databases.deleteDocument.mockResolvedValue({});

    const { useClassesStore } = await import('../store/classesStore.js');
    useClassesStore.setState({
      classes: [{ id: 'class-1', name: 'Adulto', academy_id: 'acad1' }],
    });

    await useClassesStore.getState().deleteClass('class-1');
    expect(databases.deleteDocument).toHaveBeenCalledWith('db-test', 'classes', 'class-1');
    expect(useClassesStore.getState().classes).toHaveLength(0);
  });
});
