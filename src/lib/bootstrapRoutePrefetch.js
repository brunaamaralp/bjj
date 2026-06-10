import { useLeadStore } from '../store/useLeadStore.js';
import { useStudentStore } from '../store/useStudentStore.js';

const LEAD_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/pipeline/,
  /^\/funil/,
  /^\/inbox/,
  /^\/perfil\//,
  /^\/relatorios/,
  /^\/tarefas/,
  /^\/novo-lead/,
];

const STUDENT_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/pipeline/,
  /^\/funil/,
  /^\/alunos/,
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
  const tasks = [];

  if (needs.leads) {
    const leadState = useLeadStore.getState();
    if (!leadState.leadsLastFetchedAt && !leadState.loading) {
      tasks.push(leadState.fetchLeads({ signal, reset: true }));
    }
  }

  if (needs.students) {
    const studentState = useStudentStore.getState();
    if (!studentState.lastFetchedAt && !studentState.loading) {
      tasks.push(studentState.fetchStudents({ signal, reset: true }));
    }
  }

  if (!tasks.length) return;
  await Promise.all(tasks);
}
