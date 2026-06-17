/**
 * GET/POST /api/sales?action=reconcile — vendas concluídas sem espelho FINANCIAL_TX.
 */
import { Query } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  isAcademyOwnerOrAdminUser,
  databases,
  DB_ID,
} from './academyAccess.js';
import { mirrorSaleFinancialsForDoc, saleHasRevenueMirror } from './salesMirror.js';
import { notifyAcademyOwner } from './notifyAcademy.js';

const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';

function json(res, status, body) {
  res.status(status).json(body);
}

export default async function salesReconcileHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }
  if (!SALES_COL || !DB_ID) return json(res, 503, { ok: false, error: 'sales_not_configured' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;
  const isOwner = await isAcademyOwnerOrAdminUser(academyDoc, me);
  if (!isOwner) return json(res, 403, { ok: false, error: 'forbidden' });

  const dryRun = req.method === 'GET' || String(req.query?.dry || '') === '1';
  const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 30));

  let sales = [];
  try {
    const resSales = await databases.listDocuments(DB_ID, SALES_COL, [
      Query.equal('academyId', academyId),
      Query.equal('status', 'concluida'),
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
    ]);
    sales = resSales.documents || [];
  } catch {
    try {
      const resSales = await databases.listDocuments(DB_ID, SALES_COL, [
        Query.equal('status', 'concluida'),
        Query.orderDesc('$createdAt'),
        Query.limit(limit * 2),
      ]);
      sales = (resSales.documents || []).filter(
        (d) => String(d.academyId || d.academy_id || '') === academyId
      );
    } catch (e) {
      return json(res, 500, { ok: false, error: 'list_failed', detail: String(e?.message || e) });
    }
  }

  const missing = [];
  const repaired = [];
  const failed = [];

  for (const sale of sales) {
    const id = sale.$id;
    const has = await saleHasRevenueMirror(id);
    if (has) continue;
    missing.push(id);
    if (dryRun) continue;
    const result = await mirrorSaleFinancialsForDoc(sale, academyDoc);
    if (result.ok) repaired.push(id);
    else failed.push({ venda_id: id, warnings: result.warnings });
  }

  if (!dryRun && failed.length) {
    try {
      await notifyAcademyOwner(academyDoc, 'sale_mirror_failed', {
        venda_id: failed[0].venda_id,
        venda_short: String(failed[0].venda_id || '').slice(-4).toUpperCase(),
        warnings: `${failed.length} venda(s) sem espelho no Caixa após reconciliação.`,
      });
    } catch {
      void 0;
    }
  }

  return json(res, 200, {
    ok: true,
    dry_run: dryRun,
    checked: sales.length,
    missing_count: missing.length,
    missing_ids: missing,
    repaired_count: repaired.length,
    repaired_ids: repaired,
    failed,
  });
}
