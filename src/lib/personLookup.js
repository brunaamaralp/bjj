import { databases, DB_ID, LEADS_COL, STUDENTS_COL } from './appwrite.js';
import { mapAppwriteDocToStudent } from './mapAppwriteStudentDoc.js';
import { mapAppwriteDocToLead } from './mapAppwriteLeadDoc.js';
import { LEAD_STATUS } from './leadStatus.js';
import { isLegacyStudentLeadDoc } from './leadStudentPayload.js';

/**
 * Busca pessoa por ID: students primeiro, depois leads (compat. migração).
 * @returns {Promise<{ person: object, collection: 'students'|'leads'|'leads_legacy' }|null>}
 */
export async function getPersonById(id) {
  const personId = String(id || '').trim();
  if (!personId) return null;

  const operationalStatusSet = new Set(Object.values(LEAD_STATUS));

  if (STUDENTS_COL) {
    try {
      const doc = await databases.getDocument(DB_ID, STUDENTS_COL, personId);
      return { person: mapAppwriteDocToStudent(doc), collection: 'students' };
    } catch {
      /* fallback */
    }
  }

  if (!LEADS_COL) return null;

  try {
    const doc = await databases.getDocument(DB_ID, LEADS_COL, personId);
    if (isLegacyStudentLeadDoc(doc)) {
      return { person: mapAppwriteDocToStudent(doc), collection: 'leads_legacy' };
    }
    return { person: mapAppwriteDocToLead(doc, operationalStatusSet), collection: 'leads' };
  } catch {
    return null;
  }
}
