import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/appwrite', () => ({
  createSessionJwt: vi.fn(),
}));

import { createSessionJwt } from '../lib/appwrite';
import {
  useTaskStore,
  buildTasksFetchKey,
  serverTaskFilters,
  shouldBlockFetchWhileLoading,
} from '../store/useTaskStore.js';

function jsonResponse(tasks) {
  return {
    ok: true,
    json: async () => ({ sucesso: true, tasks, has_more: false, next_cursor: null }),
  };
}

function resetStore() {
  useTaskStore.setState({
    tasks: [],
    notificationTasks: [],
    loading: false,
    loadingMore: false,
    notificationTasksLoading: false,
    tasksHasMore: false,
    tasksCursor: null,
    tasksLastFetchedAt: null,
    tasksFetchKey: null,
    fetchGeneration: 0,
    notificationFetchGeneration: 0,
    error: null,
    updatingTaskIds: [],
  });
}

describe('shouldBlockFetchWhileLoading', () => {
  it('bloqueia quando loading e sem scopeMismatch', () => {
    expect(shouldBlockFetchWhileLoading({ loading: true, silent: false, scopeMismatch: false })).toBe(
      true
    );
  });

  it('não bloqueia quando scopeMismatch mesmo com loading', () => {
    expect(shouldBlockFetchWhileLoading({ loading: true, silent: false, scopeMismatch: true })).toBe(
      false
    );
  });
});

describe('fetchTasks serialização', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    createSessionJwt.mockResolvedValue('jwt');
    global.fetch = vi.fn();
  });

  it('descarta resposta de fetch antigo quando novo fetch completa primeiro', async () => {
    const deferred = [];
    fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.push(resolve);
        })
    );

    const allKey = buildTasksFetchKey('acad-a', serverTaskFilters({ status: 'all' }));

    const oldFetch = useTaskStore.getState().fetchTasks('acad-a', {
      silent: true,
      filters: { status: 'pending' },
    });
    const newFetch = useTaskStore.getState().fetchTasks('acad-a', {
      filters: serverTaskFilters({ status: 'all' }),
      scopeMismatch: true,
    });

    await vi.waitFor(() => expect(deferred.length).toBe(2));

    deferred[1](jsonResponse([{ id: 'new', status: 'pending' }]));
    await newFetch;
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['new']);
    expect(useTaskStore.getState().tasksFetchKey).toBe(allKey);

    deferred[0](jsonResponse([{ id: 'old', status: 'pending' }]));
    await oldFetch;
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['new']);
    expect(useTaskStore.getState().tasksFetchKey).toBe(allKey);
  });

  it('força refetch quando scopeMismatch mesmo com loading true', async () => {
    useTaskStore.setState({
      loading: true,
      tasksFetchKey: buildTasksFetchKey('acad-a', { status: 'pending' }),
    });
    fetch.mockResolvedValue(jsonResponse([{ id: 'all-1', status: 'done' }]));

    await useTaskStore.getState().fetchTasks('acad-a', {
      filters: serverTaskFilters({ status: 'all' }),
      scopeMismatch: true,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(useTaskStore.getState().loading).toBe(false);
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['all-1']);
  });

  it('fetch silencioso não grava erro global (ex.: Dashboard)', async () => {
    fetch.mockRejectedValue(new Error('HTTP 503'));

    await useTaskStore.getState().fetchTasks('acad-a', {
      silent: true,
      filters: { status: 'pending' },
    });

    expect(useTaskStore.getState().error).toBeNull();
  });

  it('fetch com erro expõe mensagem amigável', async () => {
    fetch.mockRejectedValue(new Error('HTTP 503'));

    await useTaskStore.getState().fetchTasks('acad-a', {
      filters: serverTaskFilters({ status: 'all' }),
    });

    expect(useTaskStore.getState().error).toBeTruthy();
  });

  it('mapeia api_proxy_unavailable para mensagem de dev', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => 'application/json' },
      json: async () => ({ sucesso: false, erro: 'api_proxy_unavailable' }),
    });

    await useTaskStore.getState().fetchTasks('acad-a', {
      filters: serverTaskFilters({ status: 'all' }),
    });

    expect(useTaskStore.getState().error).toMatch(/vercel dev/i);
  });
});

describe('notificationTasks slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    createSessionJwt.mockResolvedValue('jwt');
    global.fetch = vi.fn();
  });

  it('Dashboard fetch (pending) não afeta notificationTasks', async () => {
    useTaskStore.setState({
      notificationTasks: [{ id: 'hub-1', status: 'pending', due_date: '2026-06-14' }],
    });
    fetch.mockResolvedValue(jsonResponse([{ id: 'dash-1', status: 'pending' }]));

    await useTaskStore.getState().fetchTasks('acad-a', {
      silent: true,
      filters: { status: 'pending' },
    });

    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['dash-1']);
    expect(useTaskStore.getState().notificationTasks.map((t) => t.id)).toEqual(['hub-1']);
  });

  it('fetchNotificationTasks popula slice dedicado', async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse([{ id: 'overdue-1', status: 'pending', due_date: '2026-06-10' }])
      )
      .mockResolvedValueOnce(
        jsonResponse([{ id: 'today-1', status: 'pending', due_date: '2026-06-15' }])
      );

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));

    await useTaskStore.getState().fetchNotificationTasks('acad-a');

    const ids = useTaskStore.getState().notificationTasks.map((t) => t.id).sort();
    expect(ids).toEqual(['overdue-1', 'today-1']);
    expect(useTaskStore.getState().tasks).toEqual([]);

    vi.useRealTimers();
  });
});

describe('patchTaskLocal', () => {
  beforeEach(() => resetStore());

  it('atualiza tasks e notificationTasks independente do fetchGeneration', () => {
    useTaskStore.setState({
      fetchGeneration: 3,
      loading: true,
      tasks: [{ id: 't1', status: 'pending' }],
      notificationTasks: [{ id: 't1', status: 'pending', due_date: '2026-06-14' }],
    });

    useTaskStore.getState().patchTaskLocal('t1', { status: 'done' });

    expect(useTaskStore.getState().tasks[0].status).toBe('done');
    expect(useTaskStore.getState().notificationTasks[0].status).toBe('done');
    expect(useTaskStore.getState().fetchGeneration).toBe(3);
  });
});
