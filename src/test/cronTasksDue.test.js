import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Query } from 'node-appwrite';

let buildTasksDueQueries;
let isTaskDueForNotification;
let processTasksDueForAcademy;
let runTasksDue;

beforeAll(async () => {
  vi.stubEnv('APPWRITE_TASKS_COLLECTION_ID', 'tasks-col');
  vi.stubEnv('APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID', 'notif-col');
  vi.stubEnv('VITE_APPWRITE_ACADEMIES_COLLECTION_ID', 'academies-col');
  vi.resetModules();
  const mod = await import('../../lib/server/runTasksDueCron.js');
  buildTasksDueQueries = mod.buildTasksDueQueries;
  isTaskDueForNotification = mod.isTaskDueForNotification;
  processTasksDueForAcademy = mod.processTasksDueForAcademy;
  runTasksDue = mod.runTasksDue;
});

const TODAY = '2026-06-15';
const NOW_ISO = '2026-06-15T10:00:00.000Z';

function dueTask(overrides = {}) {
  return {
    $id: 'task-1',
    academy_id: 'acad-a',
    status: 'pending',
    due_date: '2026-06-14',
    assigned_to: 'user-1',
    lead_id: 'lead-1',
    lead_name: 'Ana',
    ...overrides,
  };
}

describe('buildTasksDueQueries', () => {
  it('filtra por academy_id e status pending', () => {
    const queries = buildTasksDueQueries('acad-a');
    expect(queries).toHaveLength(3);
    expect(queries[0]).toEqual(Query.equal('academy_id', ['acad-a']));
    expect(queries[1]).toEqual(Query.equal('status', ['pending']));
  });
});

describe('processTasksDueForAcademy', () => {
  let createDocument;
  let listDocuments;

  beforeEach(() => {
    createDocument = vi.fn().mockResolvedValue({});
    listDocuments = vi.fn();
  });

  it('processa apenas tarefas da academia correta', async () => {
    listDocuments.mockImplementation((dbId, colId, queries) => {
      if (colId === 'tasks-col') {
        expect(queries[0]).toEqual(Query.equal('academy_id', ['acad-a']));
        return {
          documents: [
            dueTask({ $id: 't-a', academy_id: 'acad-a' }),
            dueTask({ $id: 't-future', academy_id: 'acad-a', due_date: '2026-06-20' }),
          ],
        };
      }
      if (colId === 'notif-col') return { documents: [] };
      return { documents: [] };
    });

    const databases = { listDocuments, createDocument };
    const out = await processTasksDueForAcademy(databases, 'db', 'acad-a', {
      todayStr: TODAY,
      nowIso: NOW_ISO,
    });

    expect(out.notified).toBe(1);
    expect(out.tasksScanned).toBe(2);
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(createDocument.mock.calls[0][3]).toMatchObject({
      academy_id: 'acad-a',
      type: 'task_due',
      note_id: 't-a',
    });
  });

  it('não processa tarefa quando query é de outra academia', async () => {
    listDocuments.mockImplementation((dbId, colId) => {
      if (colId === 'tasks-col') return { documents: [] };
      return { documents: [] };
    });

    const databases = { listDocuments, createDocument };
    const out = await processTasksDueForAcademy(databases, 'db', 'acad-b', {
      todayStr: TODAY,
      nowIso: NOW_ISO,
    });

    expect(out.notified).toBe(0);
    expect(createDocument).not.toHaveBeenCalled();
    expect(listDocuments.mock.calls.some(([, colId]) => colId === 'tasks-col')).toBe(true);
    const taskCall = listDocuments.mock.calls.find(([, colId]) => colId === 'tasks-col');
    expect(taskCall[2][0]).toEqual(Query.equal('academy_id', ['acad-b']));
  });

  it('não duplica notificação se já existe task_due para a tarefa', async () => {
    listDocuments.mockImplementation((dbId, colId) => {
      if (colId === 'tasks-col') {
        return { documents: [dueTask({ $id: 't-dup' })] };
      }
      if (colId === 'notif-col') {
        return { documents: [{ $id: 'existing-notif' }] };
      }
      return { documents: [] };
    });

    const databases = { listDocuments, createDocument };
    const out = await processTasksDueForAcademy(databases, 'db', 'acad-a', {
      todayStr: TODAY,
      nowIso: NOW_ISO,
    });

    expect(out.notified).toBe(0);
    expect(createDocument).not.toHaveBeenCalled();
  });
});

describe('runTasksDue', () => {
  it('itera academias e agrega resultados por tenant', async () => {
    const createDocument = vi.fn().mockResolvedValue({});
    const listDocuments = vi.fn().mockImplementation((dbId, colId) => {
      if (colId === 'academies-col') {
        return { documents: [{ $id: 'acad-a' }, { $id: 'acad-b' }] };
      }
      if (colId === 'tasks-col') {
        return { documents: [] };
      }
      return { documents: [] };
    });

    const out = await runTasksDue({ listDocuments, createDocument }, 'db');

    expect(out.sucesso).toBe(true);
    expect(out.academiesProcessed).toBe(2);
    expect(out.byAcademy).toHaveLength(2);
    expect(out.byAcademy.map((r) => r.academyId)).toEqual(['acad-a', 'acad-b']);
  });
});

describe('isTaskDueForNotification', () => {
  it('inclui vencidas e hoje', () => {
    expect(isTaskDueForNotification('2026-06-14', TODAY)).toBe(true);
    expect(isTaskDueForNotification('2026-06-15', TODAY)).toBe(true);
    expect(isTaskDueForNotification('2026-06-16', TODAY)).toBe(false);
  });
});
