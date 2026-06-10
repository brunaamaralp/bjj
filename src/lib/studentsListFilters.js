import { STUDENT_STATUS } from './studentStatus.js';

export const SEM_TURMA_FILTER = 'Sem turma';

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

/**
 * @param {object} filters
 * @param {string} filters.debouncedSearch
 * @param {string} filters.filtroPlano
 * @param {string} filters.filtroTurma
 * @param {string} filters.filtroOrigem
 * @param {boolean} filters.showInactive
 */
export function buildStudentsServerFetchOpts(filters) {
  const search = String(filters.debouncedSearch || '').trim();
  const filtroTurma = String(filters.filtroTurma || 'Todas');
  const filtroOrigem = String(filters.filtroOrigem || 'Todas');
  const filtroPlano = String(filters.filtroPlano || 'Todos');

  return {
    search: search.length >= 2 ? search : undefined,
    plan: filtroPlano !== 'Todos' ? filtroPlano : undefined,
    turma:
      filtroTurma !== 'Todas' && filtroTurma !== SEM_TURMA_FILTER ? filtroTurma : undefined,
    turmaEmpty: filtroTurma === SEM_TURMA_FILTER ? true : undefined,
    origin: filtroOrigem !== 'Todas' ? filtroOrigem : undefined,
    studentStatus: filters.showInactive ? STUDENT_STATUS.INACTIVE : STUDENT_STATUS.ACTIVE,
  };
}

/**
 * @param {object} filters
 */
export function hasStudentsServerFilters(filters) {
  const search = String(filters.debouncedSearch || '').trim();
  const filtroTurma = String(filters.filtroTurma || 'Todas');
  const filtroOrigem = String(filters.filtroOrigem || 'Todas');
  const filtroPlano = String(filters.filtroPlano || 'Todos');

  return (
    search.length >= 2 ||
    filtroPlano !== 'Todos' ||
    filtroTurma !== 'Todas' ||
    filtroOrigem !== 'Todas' ||
    Boolean(filters.showInactive)
  );
}

/**
 * @param {ReturnType<typeof buildStudentsServerFetchOpts>} serverFetchOpts
 */
export function buildServerAppliedFlags(serverFetchOpts) {
  return {
    search: Boolean(serverFetchOpts?.search),
    plan: Boolean(serverFetchOpts?.plan),
    turma: Boolean(serverFetchOpts?.turma),
    turmaEmpty: Boolean(serverFetchOpts?.turmaEmpty),
    origin: Boolean(serverFetchOpts?.origin),
    studentStatus:
      serverFetchOpts?.studentStatus === STUDENT_STATUS.INACTIVE ||
      serverFetchOpts?.studentStatus === STUDENT_STATUS.ACTIVE,
  };
}

function getTurmaVal(student) {
  return String(student.turma || student.className || '').trim();
}

/**
 * @param {object} student
 * @param {object} filters
 * @param {object} ctx
 * @param {boolean} ctx.serverSearchActive
 * @param {ReturnType<typeof buildServerAppliedFlags>} ctx.serverApplied
 */
export function studentMatchesClientFilters(student, filters, ctx) {
  const q = String(filters.debouncedSearch || '').trim().toLowerCase();
  const qPhone = normalizePhone(filters.debouncedSearch);
  const turmaVal = getTurmaVal(student);
  const filtroOrigem = String(filters.filtroOrigem || 'Todas');
  const filtroTurma = String(filters.filtroTurma || 'Todas');
  const filtroPlano = String(filters.filtroPlano || 'Todos');

  const matchBusca =
    ctx.serverApplied.search ||
    ctx.serverSearchActive ||
    (!q && !qPhone) ||
    (qPhone && normalizePhone(student.phone || '').includes(qPhone)) ||
    (q && String(student.name || '').toLowerCase().includes(q)) ||
    (q && turmaVal.toLowerCase().includes(q));

  const matchOrigem =
    ctx.serverApplied.origin || filtroOrigem === 'Todas' || student.origin === filtroOrigem;

  const matchTurma =
    ctx.serverApplied.turma ||
    ctx.serverApplied.turmaEmpty ||
    filtroTurma === 'Todas' ||
    (filtroTurma === SEM_TURMA_FILTER ? !turmaVal : turmaVal === filtroTurma);

  const matchPlano =
    ctx.serverApplied.plan ||
    filtroPlano === 'Todos' ||
    String(student.plan || '').trim() === filtroPlano;

  return matchBusca && matchOrigem && matchTurma && matchPlano;
}

export function sortStudents(students, ordenacao) {
  const list = Array.isArray(students) ? [...students] : [];
  list.sort((a, b) => {
    const nA = a.name || '';
    const nB = b.name || '';
    const dA = a.createdAt || '';
    const dB = b.createdAt || '';
    if (ordenacao === 'az') return nA.localeCompare(nB, 'pt');
    if (ordenacao === 'za') return nB.localeCompare(nA, 'pt');
    if (ordenacao === 'recentes') return dB.localeCompare(dA);
    if (ordenacao === 'antigos') return dA.localeCompare(dB);
    return 0;
  });
  return list;
}

/**
 * @param {object[]} students
 * @param {object} filters
 * @param {object} ctx
 */
export function applyStudentsListPipeline(students, filters, ctx) {
  const filtered = (Array.isArray(students) ? students : []).filter((s) =>
    studentMatchesClientFilters(s, filters, ctx)
  );
  return sortStudents(filtered, filters.ordenacao || 'az');
}
