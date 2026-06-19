import { useLeadStore } from '../store/useLeadStore.js';
import { useStudentStore } from '../store/useStudentStore.js';

const LEAD_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/pipeline/,
  /^\/funil/,
  /^\/inbox/,
  /^\/lead\//,
  /^\/perfil\//,
  /^\/reports(?:\/|$)/,
  /^\/relatorios/,
  /^\/tarefas/,
  /^\/novo-lead/,
  /^\/new-lead(?:\/|$)/,
];

const STUDENT_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/pipeline/,
  /^\/funil/,
  /^\/alunos/,
  /^\/financeiro/,
  /^\/caixa/,
  /^\/lead\//,
  /^\/perfil\//,
  /^\/mensalidades/,
  /^\/presenca/,
  /^\/recepcao/,
];

/**
 * @param {string} pathname
 * @returns {{ leads: boolean, students: boolean }}
 */
export function resolveRouteBootstrapNeeds(pathname) {
  const path = String(pathname || '/').trim() || '/';
  return {
    leads: LEAD_ROUTE_PATTERNS.some((re) => re.test(path)),
    students: STUDENT_ROUTE_PATTERNS.some((re) => re.test(path)),
  };
}

const DEFAULT_LIST_STALE_MS = 5 * 60 * 1000;

/** Evita segundo fetch quando prefetch ou outra rota já carregou a lista. */
export function shouldSkipLeadsListFetch(state, staleMs = DEFAULT_LIST_STALE_MS) {
  if (!state) return false;
  if (state.loading || state.loadingMore) return true;
  if (
    state.leads.length > 0 &&
    state.leadsLastFetchedAt &&
    Date.now() - state.leadsLastFetchedAt < staleMs
  ) {
    return true;
  }
  return false;
}

/** Evita segundo fetch de alunos quando prefetch ou outra rota já carregou a lista. */
export function shouldSkipStudentsListFetch(state, staleMs = DEFAULT_LIST_STALE_MS) {
  if (!state) return false;
  if (state.loading || state.loadingMore) return true;
  if (
    state.students.length > 0 &&
    state.lastFetchedAt &&
    Date.now() - state.lastFetchedAt < staleMs
  ) {
    return true;
  }
  return false;
}

/**
 * Prefetch leads/alunos só quando a rota atual precisa e o store ainda está vazio.
 * Não bloqueia o shell — chamadas devem usar `void prefetchRouteBootstrapData(...)`.
 *
 * @param {string} pathname
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function prefetchRouteBootstrapData(pathname, opts = {}) {
  const { signal } = opts;
  const needs = resolveRouteBootstrapNeeds(pathname);
  const path = String(pathname || '/').trim() || '/';
  const deferHeavyLists = /^\/inbox(?:\/|$)/.test(path);
  const tasks = [];

  const scheduleTask = (task) => {
    if (!deferHeavyLists) {
      tasks.push(task());
      return;
    }
    if (typeof window !== 'undefined') {
      const schedule =
        typeof requestIdleCallback === 'function'
          ? (cb) => requestIdleCallback(cb, { timeout: 4000 })
          : (cb) => window.setTimeout(cb, 2000);
      schedule(() => {
        if (signal?.aborted) return;
        void task();
      });
      return;
    }
    tasks.push(task());
  };

  if (needs.leads) {
    const leadState = useLeadStore.getState();
    if (!leadState.leadsLastFetchedAt && !leadState.loading) {
      scheduleTask(() => leadState.fetchLeads({ signal, reset: true }));
    }
  }

  if (needs.students) {
    const studentState = useStudentStore.getState();
    if (!studentState.lastFetchedAt && !studentState.loading) {
      scheduleTask(() => studentState.fetchStudents({ signal, reset: true }));
    }
  }

  if (!tasks.length) return;
  await Promise.all(tasks);
}
