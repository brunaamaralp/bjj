import { Query } from 'node-appwrite';
import { STUDENT_STATUS, filterMappedStudentsByListStatus } from '../../src/lib/studentStatus.js';

export const STUDENT_LIST_PAGE_SIZE = 200;

/** Campos existentes em STUDENTS_ATTRS (verify-and-fix-schema-crm.mjs). */
export const STUDENT_LIST_SELECT = [
  '$id',
  '$createdAt',
  'name',
  'phone',
  'plan',
  'turma',
  'source_origin',
  'birth_date',
  'student_status',
  'controlid_synced',
  'controlid_sync_error',
  'device_id',
  'controlid_user_id',
  'photo_url',
  'academyId',
];

export function resolveStudentTurmaKey() {
  const raw = String(process.env.VITE_APPWRITE_LEAD_TURMA_ATTR || 'turma').trim();
  const lower = raw.toLowerCase();
  if (['off', 'false', '0', 'no', 'none'].includes(lower)) return null;
  if (lower === 'class_name' || lower === 'classname') return 'class_name';
  return raw || 'turma';
}

/**
 * @param {Record<string, string>} query
 */
export function parseStudentsListQueryParams(query = {}) {
  const search = String(query.search || '').trim();
  const plan = String(query.plan || '').trim();
  const turma = String(query.turma || '').trim();
  const origin = String(query.origin || '').trim();
  const cursor = String(query.cursor || '').trim();
  const turmaEmpty =
    query.turma_empty === '1' ||
    query.turma_empty === 'true' ||
    query.turmaEmpty === 'true' ||
    query.turmaEmpty === '1';
  const studentStatusRaw = String(query.student_status || query.studentStatus || '').trim();
  const limit = Math.min(
    STUDENT_LIST_PAGE_SIZE,
    Math.max(1, Number(query.limit) || STUDENT_LIST_PAGE_SIZE)
  );

  let studentStatus = STUDENT_STATUS.ACTIVE;
  if (studentStatusRaw === STUDENT_STATUS.INACTIVE) {
    studentStatus = STUDENT_STATUS.INACTIVE;
  } else if (studentStatusRaw === 'all') {
    studentStatus = 'all';
  }

  return {
    search: search.length >= 2 ? search : undefined,
    plan: plan || undefined,
    turma: turma || undefined,
    turmaEmpty: turmaEmpty || undefined,
    origin: origin || undefined,
    studentStatus,
    cursor: cursor || undefined,
    limit,
  };
}

/**
 * @param {string} academyId
 * @param {ReturnType<typeof parseStudentsListQueryParams>} opts
 * @param {string|null} turmaKey
 */
export function buildStudentsListDocumentQueries(
  academyId,
  opts,
  turmaKey,
  { withSelect = true, withStatusFilter = true } = {}
) {
  const queries = [
    Query.equal('academyId', academyId),
    Query.orderDesc('$createdAt'),
    Query.limit(opts.limit),
  ];
  if (withSelect) queries.push(Query.select(STUDENT_LIST_SELECT));

  if (opts.search) queries.push(Query.contains('name', opts.search));
  if (opts.plan) queries.push(Query.equal('plan', String(opts.plan).trim()));
  if (withStatusFilter) {
    if (opts.studentStatus === STUDENT_STATUS.INACTIVE) {
      queries.push(Query.equal('student_status', STUDENT_STATUS.INACTIVE));
    } else if (opts.studentStatus !== 'all') {
      // Inclui legado sem student_status (normalizeStudentStatus trata vazio como active).
      queries.push(Query.notEqual('student_status', STUDENT_STATUS.INACTIVE));
    }
  }
  if (opts.turma && turmaKey) {
    queries.push(Query.equal(turmaKey, String(opts.turma).trim()));
  } else if (opts.turmaEmpty && turmaKey) {
    queries.push(Query.equal(turmaKey, ''));
  }
  if (opts.origin) {
    queries.push(Query.equal('source_origin', String(opts.origin).trim()));
  }
  if (opts.cursor) {
    queries.push(Query.cursorAfter(opts.cursor));
  }

  return queries;
}

/** @deprecated use filterMappedStudentsByListStatus */
export function filterStudentsListItems(items, studentStatus) {
  return filterMappedStudentsByListStatus(items, studentStatus);
}

const LIST_QUERY_ATTEMPTS = [
  { withSelect: true, withStatusFilter: true },
  { withSelect: false, withStatusFilter: true },
  { withSelect: false, withStatusFilter: false },
];

/**
 * Executa listDocuments com fallbacks (select / filtro de status) para evitar 500 por índice ou schema.
 * @returns {Promise<{ documents: object[], total: number | null, postFilterStatus: boolean }>}
 */
export async function listStudentsDocumentsWithFallback(databases, dbId, studentsCol, academyId, opts, turmaKey) {
  let lastErr;
  for (const flags of LIST_QUERY_ATTEMPTS) {
    try {
      const queries = buildStudentsListDocumentQueries(academyId, opts, turmaKey, flags);
      const response = await databases.listDocuments(dbId, studentsCol, queries);
      return {
        documents: response.documents || [],
        total: typeof response.total === 'number' ? response.total : null,
        postFilterStatus: !flags.withStatusFilter,
      };
    } catch (e) {
      lastErr = e;
      console.warn(
        '[students/list] query failed, retrying…',
        flags,
        e?.message || e
      );
    }
  }
  throw lastErr;
}
