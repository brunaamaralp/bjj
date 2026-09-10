import { create } from 'zustand';
import { ID, Query } from 'appwrite';
import { databases, DB_ID, INSTRUCTORS_COL } from '../lib/appwrite.js';
import { buildClientDocumentPermissions } from '../lib/clientDocumentPermissions';
import { permissionContextFromAcademy } from '../lib/academyContext.js';
import { friendlyError } from '../lib/errorMessages.js';
import {
  buildStaffRosterPayload,
  mapStaffRosterDoc,
  validateStaffRosterForm,
} from '../../lib/staffRoster.js';

export function isStaffRosterConfigured() {
  return Boolean(String(INSTRUCTORS_COL || '').trim());
}

function sortRoster(list) {
  return [...(list || [])].sort((a, b) => {
    const order = (a.sort_order || 0) - (b.sort_order || 0);
    if (order !== 0) return order;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });
}

export const useStaffRosterStore = create((set, get) => ({
  roster: [],
  loading: false,
  error: null,

  fetchRoster: async (academyId, opts = {}) => {
    const aid = String(academyId || '').trim();
    if (!aid) return [];
    if (!isStaffRosterConfigured()) {
      set({ roster: [], loading: false, error: null });
      return [];
    }
    if (!opts.silent) set({ loading: true, error: null });
    try {
      const queries = [Query.equal('academy_id', aid), Query.limit(500)];
      if (opts.activeOnly === true) queries.push(Query.equal('is_active', true));
      const res = await databases.listDocuments(DB_ID, INSTRUCTORS_COL, queries);
      const roster = sortRoster((res.documents || []).map(mapStaffRosterDoc).filter(Boolean));
      set({ roster, loading: false, error: null });
      return roster;
    } catch (e) {
      console.error('[staffRosterStore] fetchRoster:', e);
      set({ loading: false, error: friendlyError(e, 'load') });
      return [];
    }
  },

  createRosterMember: async (data) => {
    if (!isStaffRosterConfigured()) throw new Error('staff_roster_not_configured');
    const validation = validateStaffRosterForm(data);
    if (!validation.valid) {
      const err = new Error(Object.values(validation.errors)[0] || 'validation_failed');
      err.validation = validation.errors;
      throw err;
    }
    const payload = buildStaffRosterPayload(data, data.academy_id);
    const permCtx = permissionContextFromAcademy(payload.academy_id);
    const perms = buildClientDocumentPermissions({
      teamId: permCtx.teamId,
      userId: permCtx.userId,
    });
    const created = await databases.createDocument(
      DB_ID,
      INSTRUCTORS_COL,
      ID.unique(),
      payload,
      perms
    );
    const mapped = mapStaffRosterDoc(created);
    set((state) => ({
      roster: sortRoster([...(state.roster || []), mapped]),
    }));
    return mapped;
  },

  updateRosterMember: async (id, data) => {
    const docId = String(id || '').trim();
    if (!docId) throw new Error('id_required');
    const existing = (get().roster || []).find((r) => r.id === docId);
    const academyId = String(data.academy_id || existing?.academy_id || '').trim();
    const validation = validateStaffRosterForm({
      name: data.name ?? existing?.name,
      role: data.role ?? existing?.role,
    });
    if (!validation.valid) {
      const err = new Error(Object.values(validation.errors)[0] || 'validation_failed');
      err.validation = validation.errors;
      throw err;
    }
    const payload = buildStaffRosterPayload(
      {
        name: data.name ?? existing?.name,
        role: data.role ?? existing?.role,
        is_active: data.is_active ?? existing?.is_active,
        sort_order: data.sort_order ?? existing?.sort_order,
      },
      academyId
    );
    const updated = await databases.updateDocument(DB_ID, INSTRUCTORS_COL, docId, payload);
    const mapped = mapStaffRosterDoc(updated);
    set((state) => ({
      roster: sortRoster(
        (state.roster || []).map((r) => (r.id === docId ? mapped : r))
      ),
    }));
    return mapped;
  },

  deleteRosterMember: async (id) => {
    const docId = String(id || '').trim();
    if (!docId) throw new Error('id_required');
    await databases.deleteDocument(DB_ID, INSTRUCTORS_COL, docId);
    set((state) => ({
      roster: (state.roster || []).filter((r) => r.id !== docId),
    }));
  },
}));
