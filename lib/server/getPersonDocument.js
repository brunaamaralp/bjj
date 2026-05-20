import { LEADS_COL, STUDENTS_COL, DB_ID } from './appwriteCollections.js';

/**
 * Busca documento de pessoa: students primeiro, depois leads (migração).
 * @returns {Promise<{ doc: object, collectionId: string }|null>}
 */
export async function getPersonDocument(databases, dbId, personId) {
  const id = String(personId || '').trim();
  const databaseId = dbId || DB_ID;
  if (!id || !databaseId) return null;

  if (STUDENTS_COL) {
    try {
      const doc = await databases.getDocument(databaseId, STUDENTS_COL, id);
      return { doc, collectionId: STUDENTS_COL };
    } catch {
      /* fallback */
    }
  }

  if (!LEADS_COL) return null;
  try {
    const doc = await databases.getDocument(databaseId, LEADS_COL, id);
    return { doc, collectionId: LEADS_COL };
  } catch {
    return null;
  }
}

export async function updatePersonDocument(databases, dbId, personId, patch) {
  const found = await getPersonDocument(databases, dbId, personId);
  if (!found) throw new Error('person_not_found');
  return databases.updateDocument(dbId || DB_ID, found.collectionId, personId, patch);
}
