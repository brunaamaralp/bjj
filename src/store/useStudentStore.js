import { create } from 'zustand';
import { databases, DB_ID, STUDENTS_COL } from '../lib/appwrite';
import { ID, Query } from 'appwrite';
import { addLeadEvent } from '../lib/leadEvents.js';
import { buildClientDocumentPermissions } from '../lib/clientDocumentPermissions.js';
import { mapAppwriteDocToStudent } from '../lib/mapAppwriteStudentDoc.js';
import { buildStudentPayloadFromDoc } from '../lib/leadStudentPayload.js';
import { useLeadStore } from './useLeadStore.js';
import { STUDENT_STATUS } from '../lib/studentStatus.js';

export const STUDENTS_PAGE_SIZE = 200;

const CLIENT_ONLY_KEYS = new Set([
  'id',
  'createdAt',
  'notes',
  '_isNew',
  '_isStudent',
  'status',
  'contact_type',
  'pipelineStage',
  'labelIds',
]);

const STUDENT_TURMA_KEY = (() => {
  const raw = String(import.meta.env.VITE_APPWRITE_LEAD_TURMA_ATTR || 'turma').trim();
  const lower = raw.toLowerCase();
  if (['off', 'false', '0', 'no', 'none'].includes(lower)) return null;
  if (lower === 'class_name' || lower === 'classname') return 'class_name';
  return raw || 'turma';
})();

const STUDENT_DUE_DAY_KEY = (() => {
  const raw = String(import.meta.env.VITE_APPWRITE_LEAD_DUE_DAY_ATTR || '').trim();
  const lower = raw.toLowerCase();
  if (!raw || ['off', 'false', '0', 'no', 'none'].includes(lower)) return null;
  if (lower === 'due_day') return 'due_day';
  if (lower === 'dueday') return 'dueDay';
  return null;
})();

function permissionContextFromStore(get) {
  const academyId = get().academyId ?? useLeadStore.getState().academyId;
  const academyList = useLeadStore.getState().academyList || [];
  const acadDoc = academyList.find((a) => a.id === academyId) || {};
  return {
    ownerId: acadDoc.ownerId || '',
    teamId: acadDoc.teamId || '',
    userId: useLeadStore.getState().userId || '',
  };
}

function updatesToStudentPatch(updates, current) {
  const patch = {};
  const u = updates;

  const copyIf = (key, val) => {
    if (val === undefined) return;
    patch[key] = val;
  };

  if (u.name !== undefined) copyIf('name', u.name);
  if (u.phone !== undefined) copyIf('phone', u.phone);
  if (u.type !== undefined) copyIf('type', u.type);
  if (u.turma !== undefined && STUDENT_TURMA_KEY) {
    patch[STUDENT_TURMA_KEY] = String(u.turma || '').trim().slice(0, 64);
  }
  if (u.origin !== undefined || u.sourceOrigin !== undefined) {
    copyIf('source_origin', String(u.sourceOrigin ?? u.origin ?? '').trim().slice(0, 128));
  }
  if (u.plan !== undefined) copyIf('plan', u.plan);
  if (u.dueDay !== undefined && STUDENT_DUE_DAY_KEY) {
    const n = Number(u.dueDay);
    patch[STUDENT_DUE_DAY_KEY] = Number.isFinite(n) && n >= 1 && n <= 31 ? Math.trunc(n) : null;
  }
  if (u.enrollmentDate !== undefined) copyIf('enrollmentDate', u.enrollmentDate);
  if (u.birthDate !== undefined) copyIf('birth_date', String(u.birthDate || '').slice(0, 10));
  if (u.sexo !== undefined) copyIf('sexo', String(u.sexo || '').trim().slice(0, 16));
  if (u.parentName !== undefined) copyIf('parentName', u.parentName);
  if (u.age !== undefined) copyIf('age', u.age != null && u.age !== '' ? String(u.age) : '');
  if (u.emergencyContact !== undefined) copyIf('emergencyContact', u.emergencyContact);
  if (u.emergencyPhone !== undefined) copyIf('emergencyPhone', u.emergencyPhone);
  if (u.cpf !== undefined) patch.cpf = u.cpf || '';
  if (u.responsavel !== undefined) patch.responsavel = u.responsavel || '';
  if (u.cpfResponsavel !== undefined) patch.cpf_responsavel = u.cpfResponsavel || '';
  if (u.preferredPaymentMethod !== undefined) {
    patch.preferred_payment_method = u.preferredPaymentMethod || '';
  }
  if (u.preferredPaymentAccount !== undefined) {
    patch.preferred_payment_account = String(u.preferredPaymentAccount || '').trim().slice(0, 128);
  }
  if (u.customAnswers !== undefined) {
    patch.custom_answers_json = JSON.stringify(u.customAnswers || {});
  }
  if (u.isFirstExperience !== undefined) copyIf('is_first_experience', u.isFirstExperience);
  if (u.belt !== undefined) copyIf('belt', u.belt);
  if (u.label_ids !== undefined) copyIf('label_ids', u.label_ids);
  if (u.studentStatus !== undefined) {
    copyIf('student_status', String(u.studentStatus || '').trim() || STUDENT_STATUS.ACTIVE);
  }
  if (u.exitReason !== undefined) copyIf('exit_reason', String(u.exitReason || '').trim());
  if (u.exitDate !== undefined) {
    const ed = String(u.exitDate || '').trim().slice(0, 10);
    copyIf('exit_date', ed || null);
  }
  if (u.device_id !== undefined) {
    const n = Number(u.device_id);
    copyIf('device_id', Number.isFinite(n) && n > 0 ? Math.trunc(n) : null);
  }
  if (u.controlid_user_id !== undefined) {
    const n = Number(u.controlid_user_id);
    copyIf('controlid_user_id', Number.isFinite(n) && n > 0 ? Math.trunc(n) : null);
  }
  if (u.controlid_synced !== undefined) copyIf('controlid_synced', u.controlid_synced === true);
  if (u.controlid_sync_error !== undefined) {
    const err = String(u.controlid_sync_error || '').trim().slice(0, 256);
    copyIf('controlid_sync_error', err || null);
  }
  if (u.photo_url !== undefined) {
    const url = String(u.photo_url || '').trim().slice(0, 512);
    copyIf('photo_url', url || null);
  }
  if (u.plan_billing !== undefined) {
    copyIf('plan_billing', String(u.plan_billing || '').trim().slice(0, 16) || null);
  }
  if (u.freeze_start !== undefined) copyIf('freeze_start', u.freeze_start || null);
  if (u.freeze_end !== undefined) copyIf('freeze_end', u.freeze_end || null);
  if (u.freeze_status !== undefined) {
    copyIf('freeze_status', String(u.freeze_status || '').trim().slice(0, 16) || null);
  }
  if (u.freeze_days_used !== undefined) {
    const n = Number(u.freeze_days_used);
    copyIf('freeze_days_used', Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0);
  }
  if (u.freeze_quota_year !== undefined) {
    copyIf('freeze_quota_year', String(u.freeze_quota_year || '').trim().slice(0, 16) || null);
  }
  if (u.convertedAt !== undefined) copyIf('converted_at', u.convertedAt);

  return patch;
}

export const useStudentStore = create((set, get) => ({
  students: [],
  loading: false,
  studentsError: false,
  loadingMore: false,
  studentsHasMore: false,
  studentsCursor: null,

  get academyId() {
    return useLeadStore.getState().academyId;
  },

  resetForAcademyChange: () =>
    set({
      students: [],
      studentsCursor: null,
      studentsHasMore: false,
      loading: false,
      loadingMore: false,
      studentsError: false,
    }),

  fetchStudents: async (opts = {}) => {
    const reset = opts.reset !== false;
    const academyId = useLeadStore.getState().academyId;
    if (!academyId || !STUDENTS_COL) return;

    if (reset) {
      if (get().loading) return;
    } else {
      if (get().loadingMore || !get().studentsHasMore || !get().studentsCursor) return;
    }

    if (reset) set({ loading: true, studentsError: false });
    else set({ loadingMore: true, studentsError: false });

    try {
      const queries = [
        Query.equal('academyId', academyId),
        Query.orderDesc('$createdAt'),
        Query.limit(STUDENTS_PAGE_SIZE),
      ];
      if (opts.search) queries.push(Query.contains('name', opts.search));
      if (!reset && get().studentsCursor) {
        queries.push(Query.cursorAfter(get().studentsCursor));
      }

      const response = await databases.listDocuments(DB_ID, STUDENTS_COL, queries);
      const docs = response.documents || [];
      const students = docs.map((doc) => mapAppwriteDocToStudent(doc));
      const lastId = docs.length ? docs[docs.length - 1].$id : null;
      const pageFull = docs.length === STUDENTS_PAGE_SIZE;

      if (reset) {
        set({
          students,
          loading: false,
          studentsError: false,
          studentsHasMore: pageFull,
          studentsCursor: pageFull && lastId ? lastId : null,
        });
      } else {
        set((state) => {
          const existingIds = new Set(state.students.map((s) => s.id));
          const appended = students.filter((s) => !existingIds.has(s.id));
          return {
            students: [...state.students, ...appended],
            loadingMore: false,
            studentsError: false,
            studentsHasMore: pageFull,
            studentsCursor: pageFull && lastId ? lastId : null,
          };
        });
      }
    } catch (e) {
      console.error('fetchStudents error:', e);
      set({ loading: false, loadingMore: false, studentsError: true });
    }
  },

  fetchMoreStudents: async () => {
    await get().fetchStudents({ reset: false });
  },

  addStudent: async (student) => {
    const academyId = useLeadStore.getState().academyId;
    if (!academyId || !STUDENTS_COL) return;

    const academyList = useLeadStore.getState().academyList || [];
    const acadDoc = academyList.find((a) => a.id === academyId) || {};
    const teamId = String(acadDoc.teamId || useLeadStore.getState().teamId || '').trim();
    const userId = String(useLeadStore.getState().userId || '').trim();
    const perms = buildClientDocumentPermissions({ teamId, userId });
    const permCtx = permissionContextFromStore(get);

    const payload = buildStudentPayloadFromDoc({ ...student, academyId });
    const doc = await databases.createDocument(DB_ID, STUDENTS_COL, ID.unique(), payload, perms);

    try {
      await addLeadEvent({
        academyId,
        leadId: doc.$id,
        type: 'import',
        text: 'Aluno cadastrado',
        createdBy: userId || 'user',
        permissionContext: permCtx,
      });
    } catch (evtErr) {
      console.warn('addStudent event:', evtErr);
    }

    const newStudent = mapAppwriteDocToStudent(doc);
    set((state) => ({ students: [newStudent, ...state.students] }));
    return newStudent;
  },

  updateStudent: async (id, updates) => {
    const current = get().students.find((s) => s.id === id);
    if (!current) throw new Error('Aluno não encontrado. Recarregue a página.');

    const filtered = {};
    for (const [k, v] of Object.entries(updates)) {
      if (!CLIENT_ONLY_KEYS.has(k)) filtered[k] = v;
    }
    if (Array.isArray(filtered.label_ids)) {
      filtered.labelIds = [...filtered.label_ids];
    }

    const patch = updatesToStudentPatch(filtered, current);
    await databases.updateDocument(DB_ID, STUDENTS_COL, id, patch);

    const merged = { ...current, ...updates };
    if (filtered.labelIds) merged.labelIds = filtered.labelIds;

    set((state) => ({
      students: state.students.map((s) => (s.id === id ? merged : s)),
    }));
  },

  deleteStudent: async (id) => {
    const previous = get().students;
    set((state) => ({ students: state.students.filter((s) => s.id !== id) }));
    try {
      await databases.deleteDocument(DB_ID, STUDENTS_COL, id);
    } catch (e) {
      set({ students: previous });
      throw e;
    }
  },

  importStudents: async (rows) => {
    const academyId = useLeadStore.getState().academyId;
    if (!academyId || !STUDENTS_COL) return;

    const academyList = useLeadStore.getState().academyList || [];
    const acadDoc = academyList.find((a) => a.id === academyId) || {};
    const teamId = String(acadDoc.teamId || useLeadStore.getState().teamId || '').trim();
    const userId = String(useLeadStore.getState().userId || '').trim();
    const perms = buildClientDocumentPermissions({ teamId, userId });
    const permCtx = permissionContextFromStore(get);
    const newStudents = [];

    for (const row of rows) {
      try {
        const payload = buildStudentPayloadFromDoc({ ...row, academyId, origin: row.origin || 'Planilha' });
        const doc = await databases.createDocument(DB_ID, STUDENTS_COL, ID.unique(), payload, perms);
        try {
          await addLeadEvent({
            academyId,
            leadId: doc.$id,
            type: 'import',
            text: 'Importado (Planilha)',
            createdBy: 'system',
            payloadJson: { source: 'Planilha' },
            permissionContext: permCtx,
          });
        } catch (evtErr) {
          console.warn('importStudents event:', evtErr);
        }
        newStudents.push(mapAppwriteDocToStudent(doc));
      } catch (e) {
        console.error('importStudents row:', row?.name, e);
      }
    }

    if (newStudents.length) {
      set((state) => ({ students: [...newStudents, ...state.students] }));
    }
  },

  getStudentById: (id) => get().students.find((s) => s.id === id),
}));

if (typeof window !== 'undefined') {
  window.useStudentStore = useStudentStore;
}
