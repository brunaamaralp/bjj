import { STUDENT_STATUS } from './studentStatus.js';
import { isStudentOnExemptPlan } from './planBilling.js';

export const SEM_TURMA_FILTER = 'Sem turma';

export const STUDENT_COBRANCA_FILTER = Object.freeze({
  TODOS: 'todos',
  PAGANTES: 'pagantes',
  ISENTOS: 'isentos',
});

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

export function normalizePlanFilterKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Compara plano do aluno com o filtro (match exato normalizado ou inclusão parcial).
 * Ex.: filtro "Anual" encontra "Plano Anual Adulto" legado no cadastro.
 */
export function studentPlanMatchesFilter(student, filtroPlano) {
  const filterKey = normalizePlanFilterKey(filtroPlano);
  if (!filterKey || filtroPlano === 'Todos') return true;
  const studentKey = normalizePlanFilterKey(student?.plan);
  if (!studentKey) return false;
  if (studentKey === filterKey) return true;
  return studentKey.includes(filterKey) || filterKey.includes(studentKey);
}

/**
 * Opções do filtro: catálogo atual + planos distintos nos cadastros (legados).
 * @returns {{ catalog: string[], legacy: string[] }}
 */
export function buildStudentPlanFilterOptions(catalogPlans, students) {
  const catalog = new Set();
  for (const entry of catalogPlans || []) {
    const name = String(entry?.name ?? entry ?? '').trim();
    if (name) catalog.add(name);
  }

  const legacy = new Set();
  for (const student of students || []) {
    const name = String(student?.plan || '').trim();
    if (name && !catalog.has(name)) legacy.add(name);
  }

  const sortPt = (a, b) => a.localeCompare(b, 'pt');
  return {
    catalog: [...catalog].sort(sortPt),
    legacy: [...legacy].sort(sortPt),
  };
}

export function isStudentListExempt(student, financeConfig) {
  return isStudentOnExemptPlan(student, financeConfig);
}

/**
 * Contagem pagantes vs isentos na lista carregada (cliente).
 * @param {object[]} students
 * @param {object} [financeConfig]
 */
export function buildStudentsCobrancaCounts(students, financeConfig) {
  let isentos = 0;
  for (const student of students || []) {
    if (isStudentListExempt(student, financeConfig)) isentos += 1;
  }
  const total = (students || []).length;
  return { todos: total, pagantes: total - isentos, isentos };
}

export function studentMatchesCobrancaFilter(student, filtroCobranca, financeConfig) {
  const f = String(filtroCobranca || STUDENT_COBRANCA_FILTER.TODOS);
  if (f === STUDENT_COBRANCA_FILTER.TODOS) return true;
  const exempt = isStudentListExempt(student, financeConfig);
  if (f === STUDENT_COBRANCA_FILTER.ISENTOS) return exempt;
  if (f === STUDENT_COBRANCA_FILTER.PAGANTES) return !exempt;
  return true;
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
  const filtroCobranca = String(filters.filtroCobranca || STUDENT_COBRANCA_FILTER.TODOS);

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
    filtroPlano === 'Todos' || studentPlanMatchesFilter(student, filtroPlano);

  const matchCobranca = studentMatchesCobrancaFilter(
    student,
    filtroCobranca,
    ctx.financeConfig
  );

  return matchBusca && matchOrigem && matchTurma && matchPlano && matchCobranca;
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
