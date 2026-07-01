/**
 * Lookup PagBank payment_id → financial_tx para match determinístico na importação.
 */
import { Query } from 'node-appwrite';
import { normalizeGatewayChargeId } from '../../src/lib/bankGatewayMatch.js';

const PAGBANK_PAYMENTS_COL =
  process.env.APPWRITE_PAGBANK_PAYMENTS_COLLECTION_ID || 'pagbank_payments';

/**
 * Mapa charge_id normalizado → financial_tx.$id ou null se ambíguo (vários tx).
 * @returns {Promise<Map<string, string|null>>}
 */
export async function buildPagbankChargeIdToTxIdMap(databases, dbId, academyId) {
  const map = new Map();
  if (!PAGBANK_PAYMENTS_COL || !academyId) return map;

  const PAGE = 100;
  let cursor = null;
  for (let page = 0; page < 30; page += 1) {
    const q = [
      Query.equal('academy_id', academyId),
      Query.limit(PAGE),
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(dbId, PAGBANK_PAYMENTS_COL, q);
    } catch {
      break;
    }
    const batch = res.documents || [];
    for (const doc of batch) {
      const chargeId = normalizeGatewayChargeId(doc.payment_id);
      const txId = String(doc.financial_entry_id || '').trim();
      if (!chargeId || !txId) continue;
      if (!map.has(chargeId)) {
        map.set(chargeId, txId);
      } else if (map.get(chargeId) !== txId) {
        map.set(chargeId, null);
      }
    }
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1]?.$id;
  }

  return map;
}
