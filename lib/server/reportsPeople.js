/**
 * Carrega e unifica leads (funil) + students (matriculados) para agregação de relatórios.
 */
import { Query } from 'node-appwrite';
import { LEADS_COL, STUDENTS_COL } from './appwriteCollections.js';

/**
 * Normaliza documento students → forma esperada por aggregateLeadsReport / reportsMetrics.
 * @param {object} doc — documento Appwrite (students)
 */
export function studentDocToReportPerson(doc) {
  if (!doc) return null;
  const origin = String(doc.source_origin ?? doc.origin ?? '').trim();
  return {
    $id: doc.$id,
    $createdAt: doc.$createdAt,
    $updatedAt: doc.$updatedAt,
    academyId: String(doc.academyId || doc.academy_id || '').trim(),
    name: doc.name,
    phone: doc.phone,
    type: doc.type || 'Adulto',
    origin,
    contact_type: 'student',
    converted_at: doc.converted_at ?? doc.convertedAt ?? null,
    enrollmentDate: doc.enrollmentDate ?? doc.enrollment_date ?? null,
    exit_date: doc.exit_date ?? doc.exitDate ?? null,
    exitDate: doc.exit_date ?? doc.exitDate ?? null,
    scheduledDate: doc.scheduledDate ?? null,
    scheduledTime: doc.scheduledTime ?? null,
    attended_at: doc.attended_at ?? null,
    missed_at: doc.missed_at ?? null,
    status: doc.status ?? null,
  };
}

/**
 * Unifica listas sem duplicar $id (students sobrescrevem leads — fonte após matrícula).
 * @param {object[]} leadDocs
 * @param {object[]} studentDocs
 */
export function mergeLeadsAndStudentsForReport(leadDocs, studentDocs) {
  const byId = new Map();
  for (const doc of leadDocs || []) {
    const id = String(doc?.$id || '').trim();
    if (!id) continue;
    byId.set(id, doc);
  }
  for (const doc of studentDocs || []) {
    const normalized = studentDocToReportPerson(doc);
    const id = String(normalized?.$id || '').trim();
    if (!id) continue;
    byId.set(id, normalized);
  }
  return [...byId.values()];
}

/**
 * Queries Appwrite para listagem paginada (leads ou students).
 * @param {{ collection: 'leads' | 'students', academyId: string, filters?: object }} opts
 */
export function buildReportPeopleQueries({ collection, academyId, filters = {} }) {
  const queries = [Query.equal('academyId', academyId)];
  if (filters?.origin && filters.origin !== 'all') {
    if (collection === 'students') {
      queries.push(Query.equal('source_origin', filters.origin));
    } else {
      queries.push(Query.equal('origin', filters.origin));
    }
  }
  if (filters?.type && filters.type !== 'all') {
    if (filters.type === 'Criança') {
      queries.push(Query.or([Query.equal('type', 'Criança'), Query.equal('type', 'Kids')]));
    } else {
      queries.push(Query.equal('type', filters.type));
    }
  }
  return queries;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} collectionId
 * @param {unknown[]} queries
 * @param {AbortSignal} [signal]
 */
export async function fetchAllCollectionDocuments(databases, dbId, collectionId, queries, signal) {
  let all = [];
  let cursor = null;
  do {
    if (signal?.aborted) throw Object.assign(new Error('timeout'), { code: 'TIMEOUT' });
    const q = cursor ? [...queries, Query.cursorAfter(cursor)] : queries;
    const res = await databases.listDocuments(dbId, collectionId, [...q, Query.limit(100)]);
    all = [...all, ...res.documents];
    cursor = res.documents.length === 100 ? res.documents[res.documents.length - 1].$id : null;
  } while (cursor);
  return all;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {object} [filters]
 * @param {AbortSignal} [signal]
 */
export async function fetchAllReportPeople(databases, dbId, academyId, filters, signal) {
  const leadQueries = buildReportPeopleQueries({ collection: 'leads', academyId, filters });
  const studentQueries = STUDENTS_COL
    ? buildReportPeopleQueries({ collection: 'students', academyId, filters })
    : null;

  const [leadDocs, studentDocs] = await Promise.all([
    LEADS_COL
      ? fetchAllCollectionDocuments(databases, dbId, LEADS_COL, leadQueries, signal)
      : Promise.resolve([]),
    studentQueries
      ? fetchAllCollectionDocuments(databases, dbId, STUDENTS_COL, studentQueries, signal)
      : Promise.resolve([]),
  ]);

  return mergeLeadsAndStudentsForReport(leadDocs, studentDocs);
}

export { LEADS_COL, STUDENTS_COL };
