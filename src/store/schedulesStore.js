import { create } from 'zustand';
import { ID, Query } from 'appwrite';
import { databases, DB_ID, SCHEDULES_COL } from '../lib/appwrite';
import { buildClientDocumentPermissions } from '../lib/clientDocumentPermissions';
import { permissionContextFromAcademy } from '../lib/academyContext.js';
import { friendlyError } from '../lib/errorMessages.js';
import {
  buildSchedulePayload,
  mapScheduleDoc,
  validateScheduleForm,
} from '../lib/schedules.js';
import { mergeScheduleWithClass } from '../lib/classes.js';
import { useClassesStore } from './classesStore.js';

export function isSchedulesConfigured() {
  return Boolean(String(SCHEDULES_COL || '').trim());
}

function buildFetchKey(academyId, activeOnly) {
  return `${String(academyId || '').trim()}|${activeOnly ? 'active' : 'all'}`;
}

function sortSchedules(list) {
  return [...(list || [])].sort((a, b) => {
    const mod = String(a.modality || '').localeCompare(String(b.modality || ''), 'pt-BR');
    if (mod !== 0) return mod;
    const time = String(a.time_start || '').localeCompare(String(b.time_start || ''));
    if (time !== 0) return time;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });
}

export const useSchedulesStore = create((set, get) => ({
  schedules: [],
  loading: false,
  error: null,
  fetchKey: null,
  mutatingIds: [],

  isMutating: (id) => get().mutatingIds.includes(String(id || '').trim()),

  fetchSchedules: async (academyId, opts = {}) => {
    const aid = String(academyId || '').trim();
    if (!aid) return [];
    if (!isSchedulesConfigured()) {
      set({ schedules: [], loading: false, error: null, fetchKey: buildFetchKey(aid, opts.activeOnly) });
      return [];
    }

    const activeOnly = opts.activeOnly === true;
    const key = buildFetchKey(aid, activeOnly);
    if (!opts.silent) set({ loading: true, error: null });

    try {
      const queries = [Query.equal('academy_id', aid), Query.limit(500)];
      if (activeOnly) queries.push(Query.equal('is_active', true));

      const res = await databases.listDocuments(DB_ID, SCHEDULES_COL, queries);
      const schedules = sortSchedules((res.documents || []).map(mapScheduleDoc).filter(Boolean));
      set({ schedules, loading: false, error: null, fetchKey: key });
      return schedules;
    } catch (e) {
      console.error('[schedulesStore] fetchSchedules:', e);
      set({
        loading: false,
        error: friendlyError(e, 'load'),
      });
      throw e;
    }
  },

  createSchedule: async (data) => {
    if (!isSchedulesConfigured()) throw new Error('schedules_not_configured');
    const classDoc = (useClassesStore.getState().classes || []).find(
      (c) => c.id === String(data.class_id || '').trim()
    );
    const mergedData = mergeScheduleWithClass(data, classDoc);
    const validation = validateScheduleForm(mergedData);
    if (!validation.valid) {
      const err = new Error(Object.values(validation.errors)[0] || 'validation_failed');
      err.validation = validation.errors;
      throw err;
    }

    const payload = buildSchedulePayload(mergedData, mergedData.academy_id);
    const permCtx = permissionContextFromAcademy(payload.academy_id);
    const perms = buildClientDocumentPermissions({
      teamId: permCtx.teamId,
      userId: permCtx.userId,
    });

    set({ loading: true, error: null });
    try {
      const created = await databases.createDocument(
        DB_ID,
        SCHEDULES_COL,
        ID.unique(),
        payload,
        perms
      );
      const mapped = mapScheduleDoc(created);
      set((state) => ({
        schedules: sortSchedules([...(state.schedules || []), mapped]),
        loading: false,
        error: null,
      }));
      return mapped;
    } catch (e) {
      console.error('[schedulesStore] createSchedule:', e);
      set({ loading: false, error: friendlyError(e, 'save') });
      throw e;
    }
  },

  updateSchedule: async (id, data) => {
    if (!isSchedulesConfigured()) throw new Error('schedules_not_configured');
    const scheduleId = String(id || '').trim();
    if (!scheduleId) throw new Error('id_missing');

    const existing = (get().schedules || []).find((s) => s.id === scheduleId);
    const merged = { ...(existing || {}), ...data, id: scheduleId };
    const classDoc = (useClassesStore.getState().classes || []).find(
      (c) => c.id === String(merged.class_id || '').trim()
    );
    const mergedData = mergeScheduleWithClass(merged, classDoc);
    const validation = validateScheduleForm(mergedData);
    if (!validation.valid) {
      const err = new Error(Object.values(validation.errors)[0] || 'validation_failed');
      err.validation = validation.errors;
      throw err;
    }

    const payload = buildSchedulePayload(mergedData, mergedData.academy_id);
    set((state) => ({
      mutatingIds: state.mutatingIds.includes(scheduleId)
        ? state.mutatingIds
        : [...state.mutatingIds, scheduleId],
      error: null,
    }));

    try {
      const updated = await databases.updateDocument(DB_ID, SCHEDULES_COL, scheduleId, payload);
      const mapped = mapScheduleDoc(updated);
      set((state) => ({
        schedules: sortSchedules(
          (state.schedules || []).map((s) => (s.id === scheduleId ? mapped : s))
        ),
        mutatingIds: state.mutatingIds.filter((x) => x !== scheduleId),
        error: null,
      }));
      return mapped;
    } catch (e) {
      console.error('[schedulesStore] updateSchedule:', e);
      set((state) => ({
        mutatingIds: state.mutatingIds.filter((x) => x !== scheduleId),
        error: friendlyError(e, 'save'),
      }));
      throw e;
    }
  },

  toggleScheduleActive: async (id, currentValue) => {
    const scheduleId = String(id || '').trim();
    if (!scheduleId) throw new Error('id_missing');
    const next = currentValue !== true;
    return get().updateSchedule(scheduleId, { is_active: next });
  },

  deleteSchedule: async (id) => {
    if (!isSchedulesConfigured()) throw new Error('schedules_not_configured');
    const scheduleId = String(id || '').trim();
    if (!scheduleId) throw new Error('id_missing');

    const previous = get().schedules;
    set((state) => ({
      schedules: (state.schedules || []).filter((s) => s.id !== scheduleId),
      mutatingIds: [...state.mutatingIds, scheduleId],
      error: null,
    }));

    try {
      await databases.deleteDocument(DB_ID, SCHEDULES_COL, scheduleId);
      set((state) => ({
        mutatingIds: state.mutatingIds.filter((x) => x !== scheduleId),
        error: null,
      }));
    } catch (e) {
      console.error('[schedulesStore] deleteSchedule:', e);
      set({
        schedules: previous,
        mutatingIds: get().mutatingIds.filter((x) => x !== scheduleId),
        error: friendlyError(e, 'delete'),
      });
      throw e;
    }
  },
}));
