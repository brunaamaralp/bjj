import { Query } from 'node-appwrite';
import { STUDENT_STATUS } from '../../src/lib/studentStatus.js';

export const STUDENT_LIST_PAGE_SIZE = 200;

export const STUDENT_LIST_SELECT = [
  '$id',
  '$createdAt',
  'name',
  'phone',
  'plan',
  'turma',
  'class_name',
  'source_origin',
  'origin',
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
export function buildStudentsListDocumentQueries(academyId, opts, turmaKey) {
  const queries = [
    Query.equal('academyId', academyId),
    Query.orderDesc('$createdAt'),
    Query.limit(opts.limit),
    Query.select(STUDENT_LIST_SELECT),
  ];

  if (opts.search) queries.push(Query.contains('name', opts.search));
  if (opts.plan) queries.push(Query.equal('plan', String(opts.plan).trim()));
  if (opts.studentStatus === STUDENT_STATUS.INACTIVE) {
    queries.push(Query.equal('student_status', STUDENT_STATUS.INACTIVE));
  } else if (opts.studentStatus !== 'all') {
    queries.push(Query.equal('student_status', STUDENT_STATUS.ACTIVE));
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
