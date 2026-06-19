import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClasses = [
  {
    id: 'class-1',
    name: 'Adulto',
    modality: 'bjj',
    instructor: 'Prof. Silva',
    level: '',
    max_capacity: null,
  },
];

vi.mock('../lib/appwrite', () => ({
  databases: {
    listDocuments: vi.fn(),
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
  DB_ID: 'db-test',
  SCHEDULES_COL: 'schedules',
}));

vi.mock('../lib/academyContext.js', () => ({
  permissionContextFromAcademy: vi.fn(() => ({ teamId: 'team-1', userId: 'user-1' })),
}));

vi.mock('../store/classesStore.js', () => ({
  useClassesStore: {
    getState: vi.fn(() => ({ classes: mockClasses })),
  },
}));

describe('schedulesStore', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('fetchSchedules maps documents and sorts by modality/time', async () => {
    const { databases } = await import('../lib/appwrite');
    databases.listDocuments.mockResolvedValue({
      documents: [
        {
          $id: '2',
          academy_id: 'acad1',
          class_id: 'class-1',
          name: 'Noite',
          modality: 'bjj',
          days_of_week: ['mon'],
          time_start: '19:00',
          time_end: '20:00',
          is_active: true,
        },
        {
          $id: '1',
          academy_id: 'acad1',
          class_id: 'class-1',
          name: 'Manhã',
          modality: 'bjj',
          days_of_week: ['mon'],
          time_start: '07:00',
          time_end: '08:00',
          is_active: true,
        },
      ],
    });

    const { useSchedulesStore } = await import('../store/schedulesStore.js');
    const list = await useSchedulesStore.getState().fetchSchedules('acad1');
    expect(list.map((s) => s.id)).toEqual(['1', '2']);
  });

  it('createSchedule validates before calling Appwrite', async () => {
    const { databases } = await import('../lib/appwrite');
    const { useSchedulesStore } = await import('../store/schedulesStore.js');

    await expect(
      useSchedulesStore.getState().createSchedule({ academy_id: 'acad1', name: '' })
    ).rejects.toThrow();
    expect(databases.createDocument).not.toHaveBeenCalled();
  });

  it('createSchedule persists class_id when turma exists', async () => {
    const { databases } = await import('../lib/appwrite');
    databases.createDocument.mockResolvedValue({
      $id: 'sch-new',
      academy_id: 'acad1',
      class_id: 'class-1',
      name: 'Noite',
      modality: 'bjj',
      days_of_week: ['tue'],
      time_start: '19:00',
      time_end: '20:00',
      is_active: true,
    });

    const { useSchedulesStore } = await import('../store/schedulesStore.js');
    await useSchedulesStore.getState().createSchedule({
      academy_id: 'acad1',
      class_id: 'class-1',
      name: 'Noite',
      modality: 'bjj',
      days_of_week: ['tue'],
      time_start: '19:00',
      time_end: '20:00',
    });

    expect(databases.createDocument).toHaveBeenCalledWith(
      'db-test',
      'schedules',
      expect.any(String),
      expect.objectContaining({ class_id: 'class-1', academy_id: 'acad1' }),
      expect.any(Array)
    );
  });

  it('toggleScheduleActive flips is_active via updateSchedule', async () => {
    const { databases } = await import('../lib/appwrite');
    databases.updateDocument.mockResolvedValue({
      $id: 'sch1',
      academy_id: 'acad1',
      class_id: 'class-1',
      name: 'Aula',
      modality: 'bjj',
      days_of_week: ['mon'],
      time_start: '07:00',
      time_end: '08:00',
      is_active: false,
    });

    const { useSchedulesStore } = await import('../store/schedulesStore.js');
    useSchedulesStore.setState({
      schedules: [
        {
          id: 'sch1',
          academy_id: 'acad1',
          class_id: 'class-1',
          name: 'Aula',
          modality: 'bjj',
          days_of_week: ['mon'],
          time_start: '07:00',
          time_end: '08:00',
          is_active: true,
        },
      ],
    });

    await useSchedulesStore.getState().toggleScheduleActive('sch1', true);
    expect(databases.updateDocument).toHaveBeenCalledWith(
      'db-test',
      'schedules',
      'sch1',
      expect.objectContaining({ is_active: false, class_id: 'class-1' })
    );
  });
});
