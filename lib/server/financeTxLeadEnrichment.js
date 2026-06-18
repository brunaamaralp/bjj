import { Query } from 'node-appwrite';
import { DB_ID, LEADS_COL, STUDENTS_COL } from './appwriteCollections.js';

const PEOPLE_NAME_ATTRS = ['$id', 'name'];

async function fetchNamesFromCollection(databases, collectionId, academyId, ids) {
  const out = new Map();
  if (!databases || !collectionId || !ids?.length) return out;

  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    try {
      const queries = [
        Query.equal('$id', chunk),
        Query.limit(chunk.length),
        Query.select(PEOPLE_NAME_ATTRS),
      ];
      if (academyId) {
        queries.unshift(Query.equal('academyId', [academyId]));
      }
      const list = await databases.listDocuments(DB_ID, collectionId, queries);
      for (const doc of list.documents || []) {
        const id = String(doc.$id || '').trim();
        const name = String(doc.name || doc.nome || '').trim();
        if (id && name) out.set(id, name);
      }
    } catch {
      void 0;
    }
  }
  return out;
}

async function fetchLeadNamesByIds(databases, academyId, ids) {
  const unique = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!databases || !unique.length) return new Map();

  const out = new Map();

  if (STUDENTS_COL) {
    const fromStudents = await fetchNamesFromCollection(databases, STUDENTS_COL, academyId, unique);
    for (const [id, name] of fromStudents) out.set(id, name);
  }

  const missing = unique.filter((id) => !out.has(id));
  if (missing.length && LEADS_COL) {
    const fromLeads = await fetchNamesFromCollection(databases, LEADS_COL, academyId, missing);
    for (const [id, name] of fromLeads) out.set(id, name);
  }

  return out;
}

/** @param {import('node-appwrite').Databases} databases */
export async function enrichTransactionsWithLeadNames(databases, academyId, transactions) {
  if (!Array.isArray(transactions) || !transactions.length) return transactions || [];
  const ids = transactions.map((tx) => String(tx.lead_id || '').trim()).filter(Boolean);
  const nameById = await fetchLeadNamesByIds(databases, academyId, ids);
  return transactions.map((tx) => {
    const lid = String(tx.lead_id || '').trim();
    const lead_name = lid ? nameById.get(lid) || String(tx.lead_name || '').trim() : '';
    return { ...tx, lead_name };
  });
}

/** @param {import('node-appwrite').Databases} databases */
export async function enrichTransactionWithLeadName(databases, academyId, tx) {
  if (!tx) return tx;
  const [enriched] = await enrichTransactionsWithLeadNames(databases, academyId, [tx]);
  return enriched || tx;
}
