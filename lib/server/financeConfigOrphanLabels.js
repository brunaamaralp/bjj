import { Query } from 'node-appwrite';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const STUDENT_PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.STUDENT_PAYMENTS_COL ||
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

/**
 * Rótulos de conta usados em lançamentos/pagamentos mas ausentes em bankAccounts[].
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {string} dbId
 */
export async function collectOrphanBankLabelsForAcademy(databases, academyId, dbId) {
  const labels = new Set();
  const id = String(academyId || '').trim();
  if (!id || !dbId) return [];

  if (FINANCIAL_TX_COL) {
    let cursor = null;
    for (let page = 0; page < 20; page += 1) {
      const queries = [Query.equal('academyId', id), Query.limit(100)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      let res;
      try {
        res = await databases.listDocuments(dbId, FINANCIAL_TX_COL, queries);
      } catch {
        break;
      }
      const docs = res.documents || [];
      for (const doc of docs) {
        const direct = String(doc.bank_account || doc.bankAccount || '').trim();
        if (direct) labels.add(direct);
        const note = String(doc.note || '');
        const match = note.match(/^@bank:([^\n]+)/m);
        if (match) labels.add(String(match[1] || '').trim());
      }
      if (docs.length < 100) break;
      cursor = docs[docs.length - 1]?.$id;
      if (!cursor) break;
    }
  }

  if (STUDENT_PAYMENTS_COL) {
    let cursor = null;
    for (let page = 0; page < 20; page += 1) {
      const queries = [Query.equal('academy_id', id), Query.limit(100)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      let res;
      try {
        res = await databases.listDocuments(dbId, STUDENT_PAYMENTS_COL, queries);
      } catch {
        break;
      }
      const docs = res.documents || [];
      for (const doc of docs) {
        const direct = String(doc.account || '').trim();
        if (direct) labels.add(direct);
      }
      if (docs.length < 100) break;
      cursor = docs[docs.length - 1]?.$id;
      if (!cursor) break;
    }
  }

  return [...labels].filter(Boolean).sort();
}
