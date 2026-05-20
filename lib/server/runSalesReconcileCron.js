/**
 * Cron: vendas concluídas sem FINANCIAL_TX — tenta recriar espelho no Caixa.
 */
import { Query } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import { mirrorSaleFinancialsForDoc } from './salesMirror.js';
import { notifyAcademyOwner } from './notifyAcademy.js';

const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const PER_ACADEMY = Math.min(40, Math.max(5, Number(process.env.SALES_RECONCILE_LIMIT || 20) || 20));

async function saleHasMirror(vendaId) {
  if (!FINANCIAL_TX_COL) return true;
  try {
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
      Query.equal('saleId', vendaId),
      Query.limit(1),
    ]);
    return (res.documents || []).length > 0;
  } catch {
    return false;
  }
}

export async function runSalesReconcileCron() {
  if (!SALES_COL || !DB_ID || !ACADEMIES_COL) {
    return { repaired: 0, failed: 0, skipped: 'not_configured' };
  }

  let repaired = 0;
  let failed = 0;
  let checked = 0;

  const academies = await databases.listDocuments(DB_ID, ACADEMIES_COL, [Query.limit(100)]);
  for (const academy of academies.documents || []) {
    const academyId = academy.$id;
    let sales = [];
    try {
      const res = await databases.listDocuments(DB_ID, SALES_COL, [
        Query.equal('academyId', academyId),
        Query.equal('status', 'concluida'),
        Query.orderDesc('$createdAt'),
        Query.limit(PER_ACADEMY),
      ]);
      sales = res.documents || [];
    } catch {
      continue;
    }

    const orphans = [];
    for (const sale of sales) {
      checked += 1;
      const has = await saleHasMirror(sale.$id);
      if (has) continue;
      orphans.push(sale);
    }

    for (const sale of orphans) {
      const result = await mirrorSaleFinancialsForDoc(sale, academy);
      if (result.ok) repaired += 1;
      else {
        failed += 1;
        if (failed === 1) {
          try {
            await notifyAcademyOwner(academy, 'sale_mirror_failed', {
              venda_id: sale.$id,
              venda_short: String(sale.$id).slice(-4).toUpperCase(),
              warnings: result.warnings?.join('; ') || 'Espelho no Caixa ausente.',
            });
          } catch {
            void 0;
          }
        }
      }
    }
  }

  console.log(
    JSON.stringify({ level: 'info', action: 'sales_reconcile_cron', checked, repaired, failed })
  );
  return { checked, repaired, failed };
}
