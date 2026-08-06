import { create } from 'zustand';
import { ID, Query } from 'appwrite';
import { databases, DB_ID, INSTRUCTORS_COL } from '../lib/appwrite.js';
import { buildClientDocumentPermissions } from '../lib/clientDocumentPermissions';
import { permissionContextFromAcademy } from '../lib/academyContext.js';
import { friendlyError } from '../lib/errorMessages.js';
import {
  buildInstructorPayload,
  mapInstructorDoc,
  validateInstructorForm,
} from '../lib/lessonRegister.js';

export function isInstructorsConfigured() {
  return Boolean(String(INSTRUCTORS_COL || '').trim());
}

function sortInstructors(list) {
  return [...(list || [])].sort((a, b) => {
    const order = (a.sort_order || 0) - (b.sort_order || 0);
    if (order !== 0) return order;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });
}

export const useInstructorsStore = create((set, get) => ({
  instructors: [],
  loading: false,
  error: null,

  fetchInstructors: async (academyId, opts = {}) => {
    const aid = String(academyId || '').trim();
    if (!aid) return [];
    if (!isInstructorsConfigured()) {
      set({ instructors: [], loading: false, error: null });
      return [];
    }

    if (!opts.silent) set({ loading: true, error: null });
    try {
      const queries = [Query.equal('academy_id', aid), Query.limit(500)];
      if (opts.activeOnly === true) queries.push(Query.equal('is_active', true));
      const res = await databases.listDocuments(DB_ID, INSTRUCTORS_COL, queries);
      const instructors = sortInstructors(
        (res.documents || []).map(mapInstructorDoc).filter(Boolean)
      );
      set({ instructors, loading: false, error: null });
      return instructors;
    } catch (e) {
      console.error('[instructorsStore] fetchInstructors:', e);
      set({ loading: false, error: friendlyError(e, 'load') });
      throw e;
    }
  },

  createInstructor: async (data) => {
    if (!isInstructorsConfigured()) throw new Error('instructors_not_configured');
    const validation = validateInstructorForm(data);
    if (!validation.valid) {
      const err = new Error(Object.values(validation.errors)[0] || 'validation_failed');
      err.validation = validation.errors;
      throw err;
    }

    const payload = buildInstructorPayload(data, data.academy_id);
    const permCtx = permissionContextFromAcademy(payload.academy_id);
    const perms = buildClientDocumentPermissions({
      teamId: permCtx.teamId,
      userId: permCtx.userId,
    });

    set({ loading: true, error: null });
    try {
      const created = await databases.createDocument(
        DB_ID,
        INSTRUCTORS_COL,
        ID.unique(),
        payload,
        perms
      );
      const mapped = mapInstructorDoc(created);
      set((state) => ({
        instructors: sortInstructors([...(state.instructors || []), mapped]),
        loading: false,
        error: null,
      }));
      return mapped;
    } catch (e) {
      console.error('[instructorsStore] createInstructor:', e);
      set({ loading: false, error: friendlyError(e, 'save') });
      throw e;
    }
  },
}));
