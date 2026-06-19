import { Query } from 'node-appwrite';
import { DB_ID } from './academyAccess.js';
import { mapClassDoc } from '../../src/lib/classes.js';

function classesColId() {
  return String(
    process.env.VITE_APPWRITE_CLASSES_COLLECTION_ID ||
      process.env.APPWRITE_CLASSES_COLLECTION_ID ||
      'classes'
  ).trim();
}

/**
 * Lista turmas (`classes`) de uma academia no servidor.
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 */
export async function listAcademyClassDocs(databases, academyId) {
  const col = classesColId();
  const aid = String(academyId || '').trim();
  if (!col || !aid) return [];
  try {
    const res = await databases.listDocuments(DB_ID, col, [
      Query.equal('academy_id', aid),
      Query.limit(500),
    ]);
    return (res.documents || []).map(mapClassDoc).filter(Boolean);
  } catch {
    return [];
  }
}
