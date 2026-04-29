import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite';
import { useLeadStore } from './useLeadStore';

function buildQueryString(academyId, filters) {
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
  return qs.toString();
}

export const useTaskStore = create((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  filters: { status: 'all', assigned_to: null, lead_id: null },

  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),

  fetchTasks: async (academyId, opts = {}) => {
    const academy = String(academyId || '').trim();
    if (!academy) return;
    if (get().loading && opts.silent !== true) return;

    if (opts.silent !== true) set({ loading: true, error: null });

    try {
      const jwt = await createSessionJwt();
      if (!jwt) {
        set({ loading: false, error: 'Sessão inválida' });
        return;
      }

      const effectiveFilters = opts.filters || get().filters;
      const qs = buildQueryString(academy, effectiveFilters);

      const res = await fetch(`/api/tasks?${qs}`, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': academy,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) {
        set({ loading: false, error: data?.erro || `HTTP ${res.status}` });
        return;
      }

      set({ tasks: data.tasks || [], loading: false, error: null });
    } catch (e) {
      console.error('[useTaskStore] fetchTasks error:', e);
      set({ loading: false, error: e?.message || 'Erro ao buscar tarefas' });
    }
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

    set({ loading: true, error: null });
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
        loading: false,
        error: null,
      }));

      return updated;
    } catch (e) {
      console.error('[useTaskStore] updateTask error:', e);
      set({ loading: false, error: e?.message || 'Erro ao atualizar tarefa' });
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

