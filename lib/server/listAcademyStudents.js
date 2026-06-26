/**
 * Lista alunos da academia (paginação Appwrite).
 */
import { Query } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { mergeMatriculatedPersonDocs } from '../../src/lib/financeStudentRoster.js';

const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

async function listCollectionDocs(collectionId, academyId) {
  const out = [];
  const aid = String(academyId || '').trim();
  if (!aid || !collectionId || !DB_ID) return out;

  let cursor = null;
  for (let page = 0; page < 50; page += 1) {
    const q = [Query.equal('academyId', [aid]), Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, collectionId, q);
    const docs = res.documents || [];
    out.push(...docs);
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return out;
}

/**
 * @param {string} academyId
 * @returns {Promise<object[]>} documentos Appwrite brutos
 */
export async function listAcademyStudentDocs(academyId) {
  const aid = String(academyId || '').trim();
  if (!aid || !DB_ID) return [];

  const studentDocs = STUDENTS_COL ? await listCollectionDocs(STUDENTS_COL, aid) : [];
  const leadDocs =
    LEADS_COL && LEADS_COL !== STUDENTS_COL ? await listCollectionDocs(LEADS_COL, aid) : [];

  return mergeMatriculatedPersonDocs(studentDocs, leadDocs);
}

/**
 * @param {string} academyId
 * @returns {Promise<object[]>} alunos mapeados (shape do cliente)
 */
export async function listAcademyStudentsMapped(academyId) {
  const docs = await listAcademyStudentDocs(academyId);
  return docs.map((d) => mapAppwriteDocToStudent(d)).filter(Boolean);
}

/**
 * @param {string} academyId
 * @returns {Promise<Map<string, object>>}
 */
export async function academyStudentsLeadById(academyId) {
  const students = await listAcademyStudentsMapped(academyId);
  return new Map(students.map((s) => [String(s.id), s]));
}
