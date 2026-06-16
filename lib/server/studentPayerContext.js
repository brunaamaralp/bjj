import { Query } from 'node-appwrite';
import { DB_ID, STUDENTS_COL } from './appwriteCollections.js';
import { parsePayerAliasesJson } from '../../src/lib/studentPayerAliases.js';

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {string[]} leadIds
 * @returns {Promise<Map<string, { lead_id: string, lead_name: string, responsavel: string, payer_aliases: import('../../src/lib/studentPayerAliases.js').PayerAlias[] }>>}
 */
export async function loadPayerContextByLeadIds(databases, academyId, leadIds) {
  const out = new Map();
  const unique = [...new Set((leadIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!databases || !STUDENTS_COL || !unique.length) return out;

  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const res = await databases.listDocuments(DB_ID, STUDENTS_COL, [
        Query.equal('$id', chunk),
        Query.equal('academyId', [academyId]),
        Query.limit(chunk.length),
      ]);
      for (const doc of res.documents || []) {
        const id = String(doc.$id || '').trim();
        if (!id) continue;
        out.set(id, {
          lead_id: id,
          lead_name: String(doc.name || '').trim(),
          responsavel: String(doc.responsavel || '').trim(),
          payer_aliases: parsePayerAliasesJson(doc.payer_aliases_json),
        });
      }
    } catch {
      void 0;
    }
  }

  return out;
}
