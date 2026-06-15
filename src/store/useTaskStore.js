import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite';
import { useLeadStore } from './useLeadStore';
import { friendlyError } from '../lib/errorMessages.js';
import { isTaskDueToday, isTaskOverdue } from '../lib/taskDue.js';

/** Mapeia chip de filtro da UI → parâmetros da API. */
export function uiFilterToApiParams(statusRaw, userId = '') {
  const status = String(statusRaw || '').trim();
  if (!status || status === 'all') return {};
  if (status === 'pendentes') return { status: 'pending' };
  if (status === 'concluidas') return { status: 'done' };
  if (status === 'minhas') {
    const uid = String(userId || '').trim();
    return uid ? { assigned_to: uid } : {};
  }
  if (status === 'vencidas') return { overdue: '1' };
  return { status };
}

/** Filtros normalizados para fetch na API (inclui chips de status). */
export function serverTaskFilters(filters = {}, userId = '') {
  const uiStatus = String(filters.status || 'all').trim() || 'all';
  const mapped = uiFilterToApiParams(uiStatus, userId);
  const leadId = String(filters.lead_id || '').trim() || null;
  const assignedTo =
    mapped.assigned_to || String(filters.assigned_to || '').trim() || null;

  return {
    uiStatus,
    status: mapped.status || null,
    assigned_to: assignedTo,
    lead_id: leadId,
    overdue: mapped.overdue || null,
  };
}

export function buildTasksFetchKey(academyId, filters = {}) {
  const academy = String(academyId || '').trim();
  const uiStatus = String(filters.uiStatus || filters.status || 'all').trim() || 'all';
  const assignedTo = String(filters.assigned_to || '').trim();
  const leadId = String(filters.lead_id || '').trim();
  const overdue = filters.overdue === '1' ? '1' : '';
  const status = String(filters.status || '').trim();
  return `${academy}|${leadId}|${assignedTo}|${uiStatus}|${status}|${overdue}`;
}

/** Filtros para fetch de tarefas no perfil do lead. */
export function leadProfileTaskFilters(leadId) {
  const id = String(leadId || '').trim();
  return id ? { lead_id: id, uiStatus: 'all', status: null } : { uiStatus: 'all', status: null };
}

/** Lista derivada do store para exibição no LeadProfile. */
export function filterTasksForLead(tasks, leadId) {
  const id = String(leadId || '').trim();
  if (!id) return [];
  return (tasks || []).filter(
    (t) => String(t.lead_id || t.leadId || '').trim() === id
  );
}

export function shouldBlockFetchWhileLoading({ loading, silent, scopeMismatch }) {
  return Boolean(loading && !silent && !scopeMismatch);
}

export function resolveFetchScopeMismatch(currentKey, academyId, filters = {}, opts = {}) {
  if (opts.scopeMismatch === true) return true;
  const targetKey = buildTasksFetchKey(academyId, filters);
  return currentKey != null && currentKey !== targetKey;
}

function buildQueryString(academyId, filters, opts = {}) {
  const qs = new URLSearchParams();
  qs.set('academy_id', academyId);
  if (filters) {
    const assignedTo = String(filters.assigned_to || '').trim();
    const leadId = String(filters.lead_id || '').trim();
    const overdue = filters.overdue === '1';
    const status = String(filters.status || '').trim();

    if (overdue) qs.set('overdue', '1');
    else if (status) qs.set('status', status);
    if (assignedTo) qs.set('assigned_to', assignedTo);
    if (leadId) qs.set('lead_id', leadId);
  }
  const limit = Number(opts.limit);
  if (Number.isFinite(limit) && limit > 0) qs.set('limit', String(Math.trunc(limit)));
  const cursor = String(opts.cursor || '').trim();
  if (cursor) qs.set('cursor', cursor);
  return qs.toString();
}

function mergeHubNotificationTasks(taskLists) {
  const byId = new Map();
  for (const list of taskLists) {
    for (const task of list || []) {
      const id = String(task?.id || '').trim();
      if (!id) continue;
      if (String(task?.status || '').trim().toLowerCase() === 'done') continue;
      const due = String(task?.due_date || '').trim();
      if (!due) continue;
      if (isTaskOverdue(due) || isTaskDueToday(due)) {
        byId.set(id, task);
      }
    }
  }
  return [...byId.values()];
}

async function requestTasksPage(academyId, filters, opts = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('jwt_missing');

  const qs = buildQueryString(academyId, filters, opts);
  const res = await fetch(`/api/tasks?${qs}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': academyId,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.sucesso) {
    throw new Error(data?.erro || `HTTP ${res.status}`);
  }
  return data;
}

function withoutUpdatingId(ids, taskId) {
  return (ids || []).filter((x) => x !== taskId);
}

function patchTaskInList(list, taskId, patch) {
  return (list || []).map((t) => (t.id === taskId ? { ...t, ...patch } : t));
}

export const NOTIFICATION_TASKS_REFRESH_MS = 5 * 60 * 1000;

export const useTaskStore = create((set, get) => ({
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
  filters: { status: 'all', assigned_to: null, lead_id: null },

  isUpdating: (id) => get().updatingTaskIds.includes(String(id || '').trim()),

  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),

  patchTaskLocal: (id, patch) => {
    const taskId = String(id || '').trim();
    if (!taskId) return;
    set((state) => ({
      tasks: patchTaskInList(state.tasks, taskId, patch),
      notificationTasks: patchTaskInList(state.notificationTasks, taskId, patch),
    }));
  },

  fetchTasks: async (academyId, opts = {}) => {
    const academy = String(academyId || '').trim();
    if (!academy) return;

    const reset = opts.reset !== false;
    const effectiveFilters = opts.filters || get().filters;
    const targetKey = buildTasksFetchKey(academy, effectiveFilters);
    const scopeMismatch = resolveFetchScopeMismatch(get().tasksFetchKey, academy, effectiveFilters, opts);

    if (reset) {
      if (shouldBlockFetchWhileLoading({ loading: get().loading, silent: opts.silent, scopeMismatch })) {
        return;
      }
    } else if (get().loadingMore || !get().tasksHasMore || !get().tasksCursor) {
      return;
    }

    const generation = get().fetchGeneration + 1;
    set((state) => ({
      fetchGeneration: generation,
      ...(reset
        ? opts.silent !== true
          ? { loading: true, error: null }
          : { error: null }
        : { loadingMore: true, error: null }),
    }));

    try {
      const data = await requestTasksPage(academy, effectiveFilters, {
        limit: opts.limit || 50,
        cursor: reset ? '' : get().tasksCursor,
      });

      if (get().fetchGeneration !== generation) return;

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
          tasksFetchKey: targetKey,
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
            tasksFetchKey: targetKey,
          };
        });
      }
    } catch (e) {
      if (get().fetchGeneration !== generation) return;
      console.error('[useTaskStore] fetchTasks error:', e);
      set({
        loading: false,
        loadingMore: false,
        error: friendlyError(e, 'load'),
      });
    }
  },

  fetchNotificationTasks: async (academyId) => {
    const academy = String(academyId || '').trim();
    if (!academy) return;

    const generation = get().notificationFetchGeneration + 1;
    set({ notificationFetchGeneration: generation, notificationTasksLoading: true });

    try {
      const hubLimit = 100;
      const [overdueData, pendingData] = await Promise.all([
        requestTasksPage(academy, { overdue: '1' }, { limit: hubLimit }),
        requestTasksPage(academy, { status: 'pending' }, { limit: hubLimit }),
      ]);

      if (get().notificationFetchGeneration !== generation) return;

      const merged = mergeHubNotificationTasks([overdueData.tasks, pendingData.tasks]);
      set({
        notificationTasks: merged,
        notificationTasksLoading: false,
      });
    } catch (e) {
      if (get().notificationFetchGeneration !== generation) return;
      console.error('[useTaskStore] fetchNotificationTasks error:', e);
      set({ notificationTasksLoading: false });
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
      set({ loading: false, error: friendlyError(e, 'save') });
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
        notificationTasks: (state.notificationTasks || []).map((t) =>
          t.id === taskId ? updated : t
        ),
        updatingTaskIds: withoutUpdatingId(state.updatingTaskIds, taskId),
        error: null,
      }));

      return updated;
    } catch (e) {
      console.error('[useTaskStore] updateTask error:', e);
      set((state) => ({
        updatingTaskIds: withoutUpdatingId(state.updatingTaskIds, taskId),
        error: friendlyError(e, 'save'),
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
    const previousNotification = get().notificationTasks;
    set((state) => ({
      tasks: (state.tasks || []).filter((t) => t.id !== taskId),
      notificationTasks: (state.notificationTasks || []).filter((t) => t.id !== taskId),
      loading: true,
      error: null,
    }));

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
      set({
        tasks: previous,
        notificationTasks: previousNotification,
        loading: false,
        error: friendlyError(e, 'delete'),
      });
      throw e;
    }
  },
}));
