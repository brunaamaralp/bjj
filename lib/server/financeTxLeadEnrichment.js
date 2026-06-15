import { Query } from 'node-appwrite';
import { DB_ID, LEADS_COL } from './appwriteCollections.js';

const LEAD_NAME_ATTRS = ['$id', 'name'];

async function fetchLeadNamesByIds(databases, academyId, ids) {
  const out = new Map();
  const unique = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!databases || !LEADS_COL || !unique.length) return out;

  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const list = await databases.listDocuments(DB_ID, LEADS_COL, [
        Query.equal('$id', chunk),
        Query.equal('academyId', [academyId]),
        Query.limit(chunk.length),
        Query.select(LEAD_NAME_ATTRS),
      ]);
      for (const doc of list.documents || []) {
        const id = String(doc.$id || '').trim();
        const name = String(doc.name || '').trim();
        if (id && name) out.set(id, name);
      }
    } catch {
      void 0;
    }
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
