import { useStudentStore, STUDENTS_PAGE_SIZE } from '../store/useStudentStore.js';
import { fetchStudentsList } from './studentsApi.js';
import { STUDENT_STATUS } from './studentStatus.js';

const DEFAULT_MAX_PAGES = 40;
const FETCH_IDLE_POLL_MS = 50;
const FETCH_IDLE_TIMEOUT_MS = 20000;
/** Quantas páginas de offset buscar em paralelo após a 1ª. */
const PARALLEL_PAGE_CONCURRENCY = 4;

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

async function loadRemainingPagesInParallel({ signal, onProgress }) {
  const state = useStudentStore.getState();
  const total = state.studentsTotal;
  const loaded = state.students.length;
  if (!state.studentsHasMore) return true;
  if (typeof total !== 'number' || total <= loaded) return false;

  const pageSize = STUDENTS_PAGE_SIZE;
  const offsets = [];
  for (let offset = loaded; offset < total; offset += pageSize) {
    offsets.push(offset);
  }
  if (!offsets.length) return false;

  const baseOpts = {
    search: state.lastFetchOpts?.search,
    plan: state.lastFetchOpts?.plan,
    turma: state.lastFetchOpts?.turma,
    turmaEmpty: state.lastFetchOpts?.turmaEmpty,
    origin: state.lastFetchOpts?.origin,
    studentStatus: state.lastFetchOpts?.studentStatus || STUDENT_STATUS.ACTIVE,
    limit: pageSize,
    signal,
  };

  for (let i = 0; i < offsets.length; i += PARALLEL_PAGE_CONCURRENCY) {
    if (signal?.aborted) return true;
    const chunk = offsets.slice(i, i + PARALLEL_PAGE_CONCURRENCY);
    const pages = await Promise.all(chunk.map((offset) => fetchStudentsList({ ...baseOpts, offset })));
    for (const page of pages) {
      useStudentStore.getState().appendStudentsPage(page.items || []);
    }
    onProgress?.(useStudentStore.getState().students);
  }

  useStudentStore.getState().markStudentsFullyLoaded();
  return true;
}

/**
 * Carrega todos os alunos da academia no store (paginação completa).
 * Usado em telas que precisam da base inteira (ex.: grade de Mensalidades).
 *
 * Após a 1ª página, tenta buscar o restante em paralelo via offset (mais rápido).
 * Se total for desconhecido, cai no fetchMore sequencial.
 *
 * @param {{ signal?: AbortSignal, maxPages?: number, refresh?: boolean, onProgress?: (students: object[]) => void }} [opts]
 */
export async function ensureAllStudentsLoaded(opts = {}) {
  const { signal, maxPages = DEFAULT_MAX_PAGES, refresh = false, onProgress } = opts;

  await waitForStudentFetchIdle(signal);
  if (signal?.aborted) return useStudentStore.getState().students;

  const store = useStudentStore.getState();
  const needsFullReload =
    refresh || !store.students.length || didLastFetchUseSubsetFilters(store.lastFetchOpts);

  if (needsFullReload) {
    await store.fetchStudents({ reset: true });
    await waitForStudentFetchIdle(signal);
  }

  const afterFirst = useStudentStore.getState().students;
  if (afterFirst.length > 0) onProgress?.(afterFirst);

  let usedParallel = false;
  try {
    usedParallel = await loadRemainingPagesInParallel({ signal, onProgress });
  } catch (err) {
    console.warn('[ensureAllStudentsLoaded] parallel pages failed, sequential fallback', err?.message || err);
    usedParallel = false;
  }

  if (!usedParallel) {
    let guard = 0;
    while (useStudentStore.getState().studentsHasMore && guard < maxPages) {
      if (signal?.aborted) break;
      await useStudentStore.getState().fetchMoreStudents();
      onProgress?.(useStudentStore.getState().students);
      guard += 1;
    }
  }

  return useStudentStore.getState().students;
}
