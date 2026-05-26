import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite';
import { useLeadStore } from './useLeadStore';

function buildQueryString(academyId, filters, opts = {}) {
  const qs = new URLSearchParams();
  qs.set('academy_id', academyId);
  if (filters) {
    const status = String(filters.status || '').trim();
    const assignedTo = String(filters.assigned_to || '').trim();
    const leadId = String(filters.lead_id || '').trim();

    if (status && status !== 'all') qs.set('status', status);
    if (assignedTo) qs.set('assigned_to', assignedTo);
    if (leadId) qs.set('lead_id', leadId);
  }
  const limit = Number(opts.limit);
  if (Number.isFinite(limit) && limit > 0) qs.set('limit', String(Math.trunc(limit)));
  const cursor = String(opts.cursor || '').trim();
  if (cursor) qs.set('cursor', cursor);
  return qs.toString();
}

function withoutUpdatingId(ids, taskId) {
  return (ids || []).filter((x) => x !== taskId);
}

export const useTaskStore = create((set, get) => ({
  tasks: [],
  loading: false,
  loadingMore: false,
  tasksHasMore: false,
  tasksCursor: null,
  tasksLastFetchedAt: null,
  error: null,
  updatingTaskIds: [],
  filters: { status: 'all', assigned_to: null, lead_id: null },

  isUpdating: (id) => get().updatingTaskIds.includes(String(id || '').trim()),

  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),

  patchTaskLocal: (id, patch) => {
    const taskId = String(id || '').trim();
    if (!taskId) return;
    set((state) => ({
      tasks: (state.tasks || []).map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    }));
  },

  fetchTasks: async (academyId, opts = {}) => {
    const academy = String(academyId || '').trim();
    if (!academy) return;

    const reset = opts.reset !== false;
    if (reset) {
      if (get().loading && opts.silent !== true) return;
    } else if (get().loadingMore || !get().tasksHasMore || !get().tasksCursor) {
      return;
    }

    if (reset) {
      if (opts.silent !== true) set({ loading: true, error: null });
    } else {
      set({ loadingMore: true, error: null });
    }

    try {
      const jwt = await createSessionJwt();
      if (!jwt) {
        set({ loading: false, loadingMore: false, error: 'Sessão inválida' });
        return;
      }

      const effectiveFilters = opts.filters || get().filters;
      const qs = buildQueryString(academy, effectiveFilters, {
        limit: opts.limit || 50,
        cursor: reset ? '' : get().tasksCursor,
      });

      const res = await fetch(`/api/tasks?${qs}`, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': academy,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) {
        set({ loading: false, loadingMore: false, error: data?.erro || `HTTP ${res.status}` });
        return;
      }

      const incoming = data.tasks || [];
      const nextCursor = data.next_cursor ? String(data.next_cursor) : null;
      const hasMore = Boolean(data.has_more);

      if (reset) {
        set({
          tasks: incoming,
          tasksCursor: nextCursor,
          tasksHasMore: hasMore,
          loading: false,
          loadingMore: false,
          error: null,
          tasksLastFetchedAt: Date.now(),
        });
      } else {
        set((state) => {
          const existingIds = new Set((state.tasks || []).map((t) => t.id));
          const appended = incoming.filter((t) => !existingIds.has(t.id));
          return {
            tasks: [...(state.tasks || []), ...appended],
            tasksCursor: nextCursor,
            tasksHasMore: hasMore,
            loadingMore: false,
            error: null,
            tasksLastFetchedAt: Date.now(),
          };
        });
      }
    } catch (e) {
      console.error('[useTaskStore] fetchTasks error:', e);
      set({
        loading: false,
        loadingMore: false,
        error: e?.message || 'Erro ao buscar tarefas',
      });
    }
  },

  fetchMoreTasks: async (academyId, opts = {}) => {
    await get().fetchTasks(academyId, { ...opts, reset: false });
  },

  createTask: async (payload) => {
    const academyId = String(useLeadStore.getState().academyId || '').trim();
    const userId = String(useLeadStore.getState().userId || '').trim();
    if (!academyId) throw new Error('academy_missing');
    if (!userId) throw new Error('user_missing');

    set({ loading: true, error: null });
    try {
      const jwt = await createSessionJwt();
      if (!jwt) throw new Error('jwt_missing');

      const body = {
        title: String(payload?.title || '').trim(),
        description: String(payload?.description || ''),
        status: String(payload?.status || 'pending'),
        due_date: String(payload?.due_date || ''),
        assigned_to: String(payload?.assigned_to || ''),
        lead_id: String(payload?.lead_id || ''),
        lead_name: String(payload?.lead_name || ''),
        created_by: userId,
      };

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'x-academy-id': academyId,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);

      const created = data.task;
      set((state) => ({
        tasks: created ? [created, ...(state.tasks || [])] : state.tasks,
        loading: false,
        error: null,
      }));

      return created;
    } catch (e) {
      console.error('[useTaskStore] createTask error:', e);
      set({ loading: false, error: e?.message || 'Erro ao criar tarefa' });
      throw e;
    }
  },

  updateTask: async (id, patch) => {
    const academyId = String(useLeadStore.getState().academyId || '').trim();
    if (!academyId) throw new Error('academy_missing');
    const taskId = String(id || '').trim();
    if (!taskId) throw new Error('id_missing');

    set((state) => ({
      updatingTaskIds: state.updatingTaskIds.includes(taskId)
        ? state.updatingTaskIds
        : [...state.updatingTaskIds, taskId],
      error: null,
    }));

    try {
      const jwt = await createSessionJwt();
      if (!jwt) throw new Error('jwt_missing');

      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'x-academy-id': academyId,
        },
        body: JSON.stringify(patch || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);

      const updated = data.task;
      set((state) => ({
        tasks: (state.tasks || []).map((t) => (t.id === taskId ? updated : t)),
        updatingTaskIds: withoutUpdatingId(state.updatingTaskIds, taskId),
        error: null,
      }));

      return updated;
    } catch (e) {
      console.error('[useTaskStore] updateTask error:', e);
      set((state) => ({
        updatingTaskIds: withoutUpdatingId(state.updatingTaskIds, taskId),
        error: e?.message || 'Erro ao atualizar tarefa',
      }));
      throw e;
    }
  },

  deleteTask: async (id) => {
    const academyId = String(useLeadStore.getState().academyId || '').trim();
    if (!academyId) throw new Error('academy_missing');
    const taskId = String(id || '').trim();
    if (!taskId) throw new Error('id_missing');

    const previous = get().tasks;
    set((state) => ({ tasks: (state.tasks || []).filter((t) => t.id !== taskId), loading: true, error: null }));

    try {
      const jwt = await createSessionJwt();
      if (!jwt) throw new Error('jwt_missing');

      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': academyId,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || `HTTP ${res.status}`);

      set({ loading: false, error: null });
    } catch (e) {
      console.error('[useTaskStore] deleteTask error:', e);
      set({ tasks: previous, loading: false, error: e?.message || 'Erro ao excluir tarefa' });
      throw e;
    }
  },
}));
