import { create } from 'zustand';
import { ID, Query } from 'appwrite';
import { databases, DB_ID, CLASSES_COL, SCHEDULES_COL } from '../lib/appwrite';
import { buildClientDocumentPermissions } from '../lib/clientDocumentPermissions';
import { permissionContextFromAcademy } from '../lib/academyContext.js';
import { friendlyError } from '../lib/errorMessages.js';
import { buildClassPayload, mapClassDoc, validateClassForm } from '../lib/classes.js';

export function isClassesConfigured() {
  return Boolean(String(CLASSES_COL || '').trim());
}

function isSchedulesColConfigured() {
  return Boolean(String(SCHEDULES_COL || '').trim());
}

function sortClasses(list) {
  return [...(list || [])].sort((a, b) => {
    const order = (a.sort_order || 0) - (b.sort_order || 0);
    if (order !== 0) return order;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });
}

export const useClassesStore = create((set, get) => ({
  classes: [],
  loading: false,
  error: null,
  mutatingIds: [],

  isMutating: (id) => get().mutatingIds.includes(String(id || '').trim()),

  fetchClasses: async (academyId, opts = {}) => {
    const aid = String(academyId || '').trim();
    if (!aid) return [];
    if (!isClassesConfigured()) {
      set({ classes: [], loading: false, error: null });
      return [];
    }

    if (!opts.silent) set({ loading: true, error: null });
    try {
      const queries = [Query.equal('academy_id', aid), Query.limit(500)];
      if (opts.activeOnly === true) queries.push(Query.equal('is_active', true));
      const res = await databases.listDocuments(DB_ID, CLASSES_COL, queries);
      const classes = sortClasses((res.documents || []).map(mapClassDoc).filter(Boolean));
      set({ classes, loading: false, error: null });
      return classes;
    } catch (e) {
      console.error('[classesStore] fetchClasses:', e);
      set({ loading: false, error: friendlyError(e, 'load') });
      throw e;
    }
  },

  createClass: async (data) => {
    if (!isClassesConfigured()) throw new Error('classes_not_configured');
    const validation = validateClassForm(data);
    if (!validation.valid) {
      const err = new Error(Object.values(validation.errors)[0] || 'validation_failed');
      err.validation = validation.errors;
      throw err;
    }

    const payload = buildClassPayload(data, data.academy_id);
    const permCtx = permissionContextFromAcademy(payload.academy_id);
    const perms = buildClientDocumentPermissions({
      teamId: permCtx.teamId,
      userId: permCtx.userId,
    });

    set({ loading: true, error: null });
    try {
      const created = await databases.createDocument(DB_ID, CLASSES_COL, ID.unique(), payload, perms);
      const mapped = mapClassDoc(created);
      set((state) => ({
        classes: sortClasses([...(state.classes || []), mapped]),
        loading: false,
        error: null,
      }));
      return mapped;
    } catch (e) {
      console.error('[classesStore] createClass:', e);
      set({ loading: false, error: friendlyError(e, 'save') });
      throw e;
    }
  },

  updateClass: async (id, data) => {
    if (!isClassesConfigured()) throw new Error('classes_not_configured');
    const classId = String(id || '').trim();
    if (!classId) throw new Error('id_missing');

    const existing = (get().classes || []).find((c) => c.id === classId);
    const merged = { ...(existing || {}), ...data, id: classId };
    const validation = validateClassForm(merged);
    if (!validation.valid) {
      const err = new Error(Object.values(validation.errors)[0] || 'validation_failed');
      err.validation = validation.errors;
      throw err;
    }

    const payload = buildClassPayload(merged, merged.academy_id);
    set((state) => ({
      mutatingIds: state.mutatingIds.includes(classId)
        ? state.mutatingIds
        : [...state.mutatingIds, classId],
      error: null,
    }));

    try {
      const updated = await databases.updateDocument(DB_ID, CLASSES_COL, classId, payload);
      const mapped = mapClassDoc(updated);
      set((state) => ({
        classes: sortClasses((state.classes || []).map((c) => (c.id === classId ? mapped : c))),
        mutatingIds: state.mutatingIds.filter((x) => x !== classId),
        error: null,
      }));
      return mapped;
    } catch (e) {
      console.error('[classesStore] updateClass:', e);
      set((state) => ({
        mutatingIds: state.mutatingIds.filter((x) => x !== classId),
        error: friendlyError(e, 'save'),
      }));
      throw e;
    }
  },

  toggleClassActive: async (id, currentValue) => {
    const classId = String(id || '').trim();
    if (!classId) throw new Error('id_missing');
    const next = currentValue !== true;
    return get().updateClass(classId, { is_active: next });
  },

  deleteClass: async (id) => {
    if (!isClassesConfigured()) throw new Error('classes_not_configured');
    const classId = String(id || '').trim();
    if (!classId) throw new Error('id_missing');

    if (isSchedulesColConfigured()) {
      const linked = await databases.listDocuments(DB_ID, SCHEDULES_COL, [
        Query.equal('class_id', classId),
        Query.limit(1),
      ]);
      const linkedCount = Number(linked.total ?? linked.documents?.length ?? 0);
      if (linkedCount > 0) {
        const err = new Error(
          `Esta turma possui ${linkedCount} horário(s) vinculado(s). Exclua ou reatribua os horários antes de remover a turma.`
        );
        err.code = 'class_has_schedules';
        err.linkedSchedules = linkedCount;
        throw err;
      }
    }

    const previous = get().classes;
    set((state) => ({
      classes: (state.classes || []).filter((c) => c.id !== classId),
      mutatingIds: [...state.mutatingIds, classId],
      error: null,
    }));

    try {
      await databases.deleteDocument(DB_ID, CLASSES_COL, classId);
      set((state) => ({
        mutatingIds: state.mutatingIds.filter((x) => x !== classId),
        error: null,
      }));
    } catch (e) {
      console.error('[classesStore] deleteClass:', e);
      set({
        classes: previous,
        mutatingIds: get().mutatingIds.filter((x) => x !== classId),
        error: friendlyError(e, 'delete'),
      });
      throw e;
    }
  },
}));
