import { useStudentStore } from '../store/useStudentStore.js';
import { STUDENT_STATUS } from './studentStatus.js';

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

  return useStudentStore.getState().students;
}
