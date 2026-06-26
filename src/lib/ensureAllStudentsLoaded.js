import { useStudentStore } from '../store/useStudentStore.js';
import { useLeadStore } from '../store/useLeadStore.js';
import { STUDENT_STATUS } from './studentStatus.js';
import { databases, DB_ID, LEADS_COL, STUDENTS_COL } from './appwrite.js';
import { Query } from 'appwrite';
import { mapLeadDocToStudentShape, isMatriculatedPersonDoc } from './financeStudentRoster.js';

const DEFAULT_MAX_PAGES = 40;
const FETCH_IDLE_POLL_MS = 50;
const FETCH_IDLE_TIMEOUT_MS = 20000;

/** Cache veio de busca/filtro na listagem de alunos — não representa a academia inteira. */
export function didLastFetchUseSubsetFilters(fetchOpts = {}) {
  return Boolean(
    fetchOpts?.search ||
      fetchOpts?.plan ||
      fetchOpts?.turma ||
      fetchOpts?.turmaEmpty ||
      fetchOpts?.origin ||
      fetchOpts?.studentStatus === STUDENT_STATUS.INACTIVE
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStudentFetchIdle(signal) {
  const deadline = Date.now() + FETCH_IDLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) return;
    const { loading, loadingMore } = useStudentStore.getState();
    if (!loading && !loadingMore) return;
    await sleep(FETCH_IDLE_POLL_MS);
  }
}

async function fetchMatriculatedLeadStudents(academyId, signal) {
  if (!LEADS_COL || !DB_ID || LEADS_COL === STUDENTS_COL || !academyId) return [];
  const out = [];
  let cursor = null;
  for (let page = 0; page < 50; page += 1) {
    if (signal?.aborted) break;
    const q = [Query.equal('academyId', academyId), Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, LEADS_COL, q);
    const batch = res.documents || [];
    for (const doc of batch) {
      if (!isMatriculatedPersonDoc(doc)) continue;
      out.push(mapLeadDocToStudentShape(doc));
    }
    if (batch.length < 100) break;
    cursor = batch[batch.length - 1]?.$id;
    if (!cursor) break;
  }
  return out.filter((s) => s?.id);
}

function appendMissingLeadStudents(leadStudents) {
  if (!leadStudents.length) return;
  useStudentStore.setState((state) => {
    const known = new Set((state.students || []).map((s) => String(s.id || '').trim()));
    const missing = leadStudents.filter((s) => !known.has(String(s.id || '').trim()));
    if (!missing.length) return state;
    const students = [...(state.students || []), ...missing];
    const studentsById = { ...state.studentsById };
    const studentIds = [...(state.studentIds || [])];
    for (const s of missing) {
      const id = String(s.id || '').trim();
      if (!id) continue;
      studentsById[id] = s;
      if (!studentIds.includes(id)) studentIds.push(id);
    }
    return { ...state, students, studentsById, studentIds };
  });
}

/**
 * Carrega todos os alunos da academia no store (paginação completa).
 * Usado em telas que precisam da base inteira (ex.: grade de Mensalidades).
 */
export async function ensureAllStudentsLoaded(opts = {}) {
  const { signal, maxPages = DEFAULT_MAX_PAGES } = opts;

  await waitForStudentFetchIdle(signal);
  if (signal?.aborted) return useStudentStore.getState().students;

  const store = useStudentStore.getState();
  const needsFullReload = !store.students.length || didLastFetchUseSubsetFilters(store.lastFetchOpts);

  if (needsFullReload) {
    await store.fetchStudents({ reset: true });
    await waitForStudentFetchIdle(signal);
  }

  let guard = 0;
  while (useStudentStore.getState().studentsHasMore && guard < maxPages) {
    if (signal?.aborted) break;
    await useStudentStore.getState().fetchMoreStudents();
    await waitForStudentFetchIdle(signal);
    guard += 1;
  }

  const academyId = String(useLeadStore.getState().academyId || '').trim();
  if (academyId && !signal?.aborted) {
    try {
      const leadStudents = await fetchMatriculatedLeadStudents(academyId, signal);
      appendMissingLeadStudents(leadStudents);
    } catch (err) {
      console.warn('[ensureAllStudentsLoaded] leads merge:', err?.message || err);
    }
  }

  return useStudentStore.getState().students;
}
