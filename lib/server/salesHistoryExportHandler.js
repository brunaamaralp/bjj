/**
 * GET /api/sales?action=history_export&from=&to=&format=pdf
 * Query opcional: status, canal, search
 */
import { apiErro } from './friendlyError.js';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import { parsePeriodBounds } from '../../src/lib/salesHistory.js';
import {
  filterSalesForHistoryExport,
  HISTORY_EXPORT_MAX_PAGES,
  HISTORY_EXPORT_PAGE_SIZE,
  historyExportFilename,
} from '../../src/lib/salesHistoryExport.js';
import { renderSalesHistoryPdfBuffer } from '../receipts/renderSalesHistoryPdf.js';
import {
  listAcademySalesPage,
  listSaleItems,
  enrichSaleItems,
  loadLeadNames,
  mapSaleDoc,
} from './salesHistoryHandler.js';

const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function json(res, status, body) {
  res.status(status).json(body);
}

function parseYmd(raw) {
  const s = String(raw || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

async function listAllAcademySalesForPeriod(academyId, from, to) {
  const all = [];
  let cursor = null;
  let truncated = false;

  for (let page = 0; page < HISTORY_EXPORT_MAX_PAGES; page++) {
    const { docs, next_cursor, has_more } = await listAcademySalesPage(academyId, {
      from,
      to,
      limit: HISTORY_EXPORT_PAGE_SIZE,
      cursor,
    });
    all.push(...docs);
    if (!has_more || !next_cursor) break;
    cursor = next_cursor;
    if (page === HISTORY_EXPORT_MAX_PAGES - 1 && has_more) {
      truncated = true;
      console.warn(
        JSON.stringify({
          event: 'sales_history_export_truncated',
          academy_id: academyId,
          count: all.length,
        })
      );
    }
  }

  return { docs: all, truncated };
}

async function loadAcademyName(academyId) {
  if (!ACADEMIES_COL) return '';
  try {
    const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    return String(academyDoc.name || '').trim();
  } catch {
    return '';
  }
}

export async function buildSalesHistoryExportPayload(academyId, { fromYmd, toYmd, filters }) {
  const { from, to } = parsePeriodBounds(fromYmd, toYmd);
  const { docs: rawDocs, truncated } = await listAllAcademySalesForPeriod(academyId, from, to);

  const itemsBySale = new Map();
  for (const doc of rawDocs) {
    const itemDocs = await listSaleItems(doc.$id);
    itemsBySale.set(doc.$id, itemDocs);
  }

  const leadIds = rawDocs.map((d) => d.aluno_id).filter(Boolean);
  const leadNames = await loadLeadNames(leadIds);

  const mappedSales = [];
  for (const doc of rawDocs) {
    const itemDocs = itemsBySale.get(doc.$id) || [];
    const items = await enrichSaleItems(itemDocs);
    mappedSales.push(mapSaleDoc(doc, items, leadNames));
  }

  const filtered = filterSalesForHistoryExport(mappedSales, filters);
  const academyName = await loadAcademyName(academyId);

  return {
    academy_name: academyName,
    from: fromYmd,
    to: toYmd,
    filters,
    sales: filtered,
    truncated,
  };
}

export default async function salesHistoryExportHandler(req, res) {
  if (!DB_ID || !SALES_COL) {
    return json(res, 503, { ok: false, error: 'sales_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const fromYmd = parseYmd(req.query?.from);
  const toYmd = parseYmd(req.query?.to);
  if (!fromYmd || !toYmd) {
    return json(res, 400, { ok: false, error: 'invalid_period' });
  }

  const format = String(req.query?.format || '').trim().toLowerCase();
  if (format !== 'pdf') {
    return json(res, 400, { ok: false, error: 'format_must_be_pdf' });
  }

  const filters = {
    status: String(req.query?.status || 'all').trim() || 'all',
    canal: String(req.query?.canal || 'all').trim() || 'all',
    search: String(req.query?.search || '').trim(),
  };

  try {
    const payload = await buildSalesHistoryExportPayload(academyId, {
      fromYmd,
      toYmd,
      filters,
    });

    const buffer = await renderSalesHistoryPdfBuffer(payload);
    const filename = historyExportFilename(fromYmd, toYmd, 'pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (e) {
    console.error('[sales] history_export:', e);
    return json(res, 500, { ok: false, error: apiErro(e, 'load') });
  }
}
