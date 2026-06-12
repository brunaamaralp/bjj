import { Query } from 'appwrite';
import { databases, DB_ID, LEADS_COL } from './appwrite.js';
import { LEAD_STATUS } from './leadStatus.js';
import { mapAppwriteDocToLead } from './mapAppwriteLeadDoc.js';
import { LEADS_PAGE_SIZE } from '../store/useLeadStore.js';

/**
 * Busca todos os leads da academia (paginado no servidor).
 * @param {string} academyId
 * @param {(loaded: number, total?: number) => void} [onProgress]
 */
export async function fetchAllLeadsPaginated(academyId, onProgress) {
  if (!academyId || !LEADS_COL) return [];

  const operationalStatusSet = new Set(Object.values(LEAD_STATUS));
  const all = [];
  let cursor = null;

  for (;;) {
    const queries = [
      Query.equal('academyId', academyId),
      Query.orderDesc('$createdAt'),
      Query.limit(LEADS_PAGE_SIZE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const res = await databases.listDocuments(DB_ID, LEADS_COL, queries);
    const docs = res.documents || [];
    all.push(...docs.map((doc) => mapAppwriteDocToLead(doc, operationalStatusSet)));
    onProgress?.(all.length, res.total);

    if (docs.length < LEADS_PAGE_SIZE) break;
    cursor = docs[docs.length - 1].$id;
  }

  return all;
}
