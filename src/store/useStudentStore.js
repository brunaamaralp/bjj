import { create } from 'zustand';
import { databases, DB_ID, STUDENTS_COL } from '../lib/appwrite';
import { ID, Query } from 'appwrite';
import { addLeadEvent } from '../lib/leadEvents.js';
import { buildClientDocumentPermissions } from '../lib/clientDocumentPermissions.js';
import { mapAppwriteDocToStudent } from '../lib/mapAppwriteStudentDoc.js';
import { buildStudentPayloadFromDoc } from '../lib/leadStudentPayload.js';
import { getAcademyContext, permissionContextFromAcademy } from '../lib/academyContext.js';
import { STUDENT_STATUS } from '../lib/studentStatus.js';
import { stripUnknownStudentPatch } from '../lib/studentAppwritePatch.js';

export const STUDENTS_PAGE_SIZE = 200;

let fetchStudentsAbortController = null;

export function cancelFetchStudents() {
  if (fetchStudentsAbortController) {
    fetchStudentsAbortController.abort();
    fetchStudentsAbortController = null;
  }
}

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

/** false = não gravar; true = gravar em due_day (nome no Appwrite). */
const STUDENT_DUE_DAY_ENABLED = (() => {
  const raw = String(import.meta.env.VITE_APPWRITE_LEAD_DUE_DAY_ATTR || '').trim();
  const lower = raw.toLowerCase();
  if (!raw || ['off', 'false', '0', 'no', 'none'].includes(lower)) return false;
  return true;
})();

function permissionContextFromStore() {
  return permissionContextFromAcademy();
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
  if (u.email !== undefined) copyIf('email', String(u.email || '').trim().slice(0, 128));
  if (u.type !== undefined) copyIf('type', u.type);
  if (u.turma !== undefined && STUDENT_TURMA_KEY) {
    patch[STUDENT_TURMA_KEY] = String(u.turma || '').trim().slice(0, 64);
  }
  if (u.origin !== undefined || u.sourceOrigin !== undefined) {
    copyIf('source_origin', String(u.sourceOrigin ?? u.origin ?? '').trim().slice(0, 128));
  }
  if (u.plan !== undefined) copyIf('plan', u.plan);
  if (u.dueDay !== undefined && STUDENT_DUE_DAY_ENABLED) {
    const n = Number(u.dueDay);
    if (Number.isFinite(n) && n >= 1 && n <= 31) {
      patch.due_day = Math.trunc(n);
    }
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

export { STUDENT_TURMA_KEY };

export const useStudentStore = create((set, get) => ({
  students: [],
  loading: false,
  studentsError: false,
  loadingMore: false,
  studentsHasMore: false,
  studentsCursor: null,
  studentsTotal: null,
  lastFetchOpts: {},
  lastFetchedAt: null,
  paymentStatusByStudentId: {},

  get academyId() {
    return getAcademyContext().academyId;
  },

  resetForAcademyChange: () => {
    cancelFetchStudents();
    set({
      students: [],
      studentsCursor: null,
      studentsHasMore: false,
      studentsTotal: null,
      lastFetchOpts: {},
      lastFetchedAt: null,
      loading: false,
      loadingMore: false,
      studentsError: false,
    });
  },

  mergeStudent: (id, updates) => {
    set((state) => ({
      students: state.students.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  },

  setStudentPaymentStatus: (studentId, paymentStatus) => {
    const sid = String(studentId || '').trim();
    if (!sid) return;
    const hint = paymentStatus
      ? { key: paymentStatus.status || paymentStatus.key, status: paymentStatus.status }
      : null;
    set((state) => ({
      paymentStatusByStudentId: {
        ...state.paymentStatusByStudentId,
        [sid]: paymentStatus,
      },
      students: state.students.map((s) =>
        s.id === sid ? { ...s, _paymentStatus: hint } : s
      ),
    }));
  },

  refreshStudentPaymentStatus: async (studentId, academyId) => {
    const sid = String(studentId || '').trim();
    const aid = String(academyId || getAcademyContext().academyId || '').trim();
    if (!sid || !aid) return null;
    const { getPaymentStatus } = await import('../lib/studentPayments.js');
    const status = await getPaymentStatus(sid, aid);
    get().setStudentPaymentStatus(sid, status);
    return status;
  },

  fetchStudentById: async (id) => {
    const found = get().students.find((s) => s.id === id);
    if (found) return found;
    if (!STUDENTS_COL || !id) return null;
    try {
      const doc = await databases.getDocument(DB_ID, STUDENTS_COL, id);
      const student = mapAppwriteDocToStudent(doc);
      set((state) => {
        const exists = state.students.some((s) => s.id === id);
        return exists
          ? { students: state.students.map((s) => (s.id === id ? student : s)) }
          : { students: [student, ...state.students] };
      });
      return student;
    } catch (e) {
      console.warn('[fetchStudentById]', id, e?.message || e);
      return null;
    }
  },

  fetchStudents: async (opts = {}) => {
    const reset = opts.reset !== false;
    const academyId = getAcademyContext().academyId;
    if (!academyId || !STUDENTS_COL) return;

    const externalSignal = opts.signal;
    if (reset && !externalSignal) {
      cancelFetchStudents();
      fetchStudentsAbortController = new AbortController();
    }
    const signal = externalSignal || (reset ? fetchStudentsAbortController?.signal : null);

    const queryOpts = reset
      ? opts
      : { ...get().lastFetchOpts, ...opts, reset: false };

    if (reset) {
      if (get().loading && !externalSignal) return;
      set({
        lastFetchOpts: {
          search: queryOpts.search,
          plan: queryOpts.plan,
          turma: queryOpts.turma,
          studentStatus: queryOpts.studentStatus,
        },
      });
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
      const search = String(queryOpts.search || '').trim();
      if (search.length >= 2) queries.push(Query.contains('name', search));
      if (queryOpts.plan) queries.push(Query.equal('plan', String(queryOpts.plan).trim()));
      if (queryOpts.studentStatus === STUDENT_STATUS.INACTIVE) {
        queries.push(Query.equal('student_status', STUDENT_STATUS.INACTIVE));
      } else if (queryOpts.studentStatus !== 'all') {
        queries.push(Query.equal('student_status', STUDENT_STATUS.ACTIVE));
      }
      if (queryOpts.turma && STUDENT_TURMA_KEY) {
        queries.push(Query.equal(STUDENT_TURMA_KEY, String(queryOpts.turma).trim()));
      }
      if (!reset && get().studentsCursor) {
        queries.push(Query.cursorAfter(get().studentsCursor));
      }

      const response = await databases.listDocuments(DB_ID, STUDENTS_COL, queries);
      const total = typeof response.total === 'number' ? response.total : null;
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
          studentsTotal: total,
          lastFetchedAt: Date.now(),
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
            studentsTotal: total ?? state.studentsTotal,
          };
        });
      }
    } catch (e) {
      if (signal?.aborted) return;
      console.error('[fetchStudents]', academyId, e?.message || e);
      set({ loading: false, loadingMore: false, studentsError: true });
    }
  },

  fetchMoreStudents: async () => {
    await get().fetchStudents({ ...get().lastFetchOpts, reset: false });
  },

  addStudent: async (student) => {
    const { academyId, academyList, teamId: storeTeamId, userId: storeUserId } = getAcademyContext();
    if (!academyId || !STUDENTS_COL) return;

    const acadDoc = academyList.find((a) => a.id === academyId) || {};
    const teamId = String(acadDoc.teamId || storeTeamId || '').trim();
    const userId = String(storeUserId || '').trim();
    const perms = buildClientDocumentPermissions({ teamId, userId });
    const permCtx = permissionContextFromStore();

    const payload = buildStudentPayloadFromDoc({ ...student, academyId });
    const doc = await databases.createDocument(DB_ID, STUDENTS_COL, ID.unique(), payload, perms);

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
    if (Object.keys(patch).length > 0) {
      try {
        await databases.updateDocument(DB_ID, STUDENTS_COL, id, patch);
      } catch (e) {
        const msg = String(e?.message || '');
        if (!/unknown attribute/i.test(msg)) throw e;
        const lean = stripUnknownStudentPatch(patch, msg);
        if (Object.keys(lean).length === 0) throw e;
        await databases.updateDocument(DB_ID, STUDENTS_COL, id, lean);
      }
    }

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
    const { academyId, academyList, teamId: storeTeamId, userId: storeUserId } = getAcademyContext();
    if (!academyId || !STUDENTS_COL) return;

    const acadDoc = academyList.find((a) => a.id === academyId) || {};
    const teamId = String(acadDoc.teamId || storeTeamId || '').trim();
    const userId = String(storeUserId || '').trim();
    const perms = buildClientDocumentPermissions({ teamId, userId });
    const permCtx = permissionContextFromStore();
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
