import { describe, it, expect, vi, beforeEach } from 'vitest';

const leadStoreState = vi.hoisted(() => ({
  academyId: 'acad-a',
  userId: 'user-1',
}));

vi.mock('../lib/appwrite', () => ({
  createSessionJwt: vi.fn(),
}));

vi.mock('../store/useLeadStore.js', () => ({
  useLeadStore: {
    getState: () => leadStoreState,
  },
}));

import { createSessionJwt } from '../lib/appwrite';
import {
  useTaskStore,
  buildTasksFetchKey,
  leadProfileTaskFilters,
  filterTasksForLead,
  serverTaskFilters,
} from '../store/useTaskStore.js';

function jsonResponse(tasks) {
  return {
    ok: true,
    json: async () => ({ sucesso: true, tasks, has_more: false, next_cursor: null }),
  };
}

describe('leadProfileTaskFilters', () => {
  it('tasksFetchKey com lead_id não colide com fetchKey de Tasks.jsx (all)', () => {
    const leadKey = buildTasksFetchKey('acad-a', leadProfileTaskFilters('lead-1'));
    const allKey = buildTasksFetchKey('acad-a', serverTaskFilters({ status: 'all' }));
    expect(leadKey).not.toBe(allKey);
    expect(leadKey).toContain('lead-1');
    expect(allKey).toBe('acad-a|||all||');
  });
});

describe('filterTasksForLead', () => {
  it('retorna só tarefas do lead', () => {
    const tasks = [
      { id: '1', lead_id: 'L1', status: 'pending' },
      { id: '2', lead_id: 'L2', status: 'pending' },
    ];
    expect(filterTasksForLead(tasks, 'L1').map((t) => t.id)).toEqual(['1']);
  });
});

describe('LeadProfile fetch via store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSessionJwt.mockResolvedValue('jwt');
    global.fetch = vi.fn();
    useTaskStore.setState({
      tasks: [],
      loading: false,
      fetchGeneration: 0,
      tasksFetchKey: null,
      error: null,
    });
  });

  it('carrega tarefas do lead via fetchTasks com lead_id', async () => {
    fetch.mockResolvedValue(
      jsonResponse([{ id: 't1', lead_id: 'lead-9', status: 'pending' }])
    );

    await useTaskStore.getState().fetchTasks('acad-a', {
      reset: true,
      filters: leadProfileTaskFilters('lead-9'),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain('lead_id=lead-9');
    expect(filterTasksForLead(useTaskStore.getState().tasks, 'lead-9')).toHaveLength(1);
  });

  it('patchTaskLocal atualiza store imediatamente para toggle otimista', () => {
    useTaskStore.setState({
      tasks: [{ id: 't1', lead_id: 'lead-9', status: 'pending' }],
    });

    useTaskStore.getState().patchTaskLocal('t1', { status: 'done' });

    expect(useTaskStore.getState().tasks[0].status).toBe('done');
    expect(filterTasksForLead(useTaskStore.getState().tasks, 'lead-9')[0].status).toBe('done');
  });

  it('fetch mais recente vence fetch antigo ao trocar de lead', async () => {
    const deferred = [];
    fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.push(resolve);
        })
    );

    const oldFetch = useTaskStore.getState().fetchTasks('acad-a', {
      silent: true,
      filters: leadProfileTaskFilters('lead-9'),
    });
    const newFetch = useTaskStore.getState().fetchTasks('acad-a', {
      filters: leadProfileTaskFilters('lead-10'),
      scopeMismatch: true,
    });

    await vi.waitFor(() => expect(deferred.length).toBe(2));

    deferred[1](jsonResponse([{ id: 't-new', lead_id: 'lead-10', status: 'pending' }]));
    await newFetch;
    deferred[0](jsonResponse([{ id: 't-old', lead_id: 'lead-9', status: 'pending' }]));
    await oldFetch;

    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['t-new']);
  });

  it('createTask adiciona tarefa visível via filterTasksForLead', async () => {
    useTaskStore.setState({
      tasks: [{ id: 't0', lead_id: 'lead-9', status: 'pending' }],
    });

    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sucesso: true,
        task: { id: 't-new', lead_id: 'lead-9', status: 'pending', title: 'Nova' },
      }),
    });

    await useTaskStore.getState().createTask({
      title: 'Nova',
      lead_id: 'lead-9',
    });

    expect(filterTasksForLead(useTaskStore.getState().tasks, 'lead-9')).toHaveLength(2);
  });
});
