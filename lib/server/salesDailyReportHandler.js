/**
 * GET /api/sales?action=daily_report&date=YYYY-MM-DD[&format=pdf]
 */
import { apiErro } from './friendlyError.js';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import { parsePeriodBounds } from '../../src/lib/salesHistory.js';
import {
  buildDailyReportPayload,
  parseReportDateYmd,
} from './salesDailyReportBuild.js';
import {
  listStudentPaymentsForReportDay,
  mapPaymentDocForDailyReport,
} from './dailyReportStudentPayments.js';
import { renderDailyReportPdfBuffer } from '../receipts/renderDailyReportPdf.js';
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

const MAX_PAGES = 20;
const PAGE_SIZE = 100;

function json(res, status, body) {
  res.status(status).json(body);
}

async function listAllAcademySalesForDay(academyId, from, to) {
  const all = [];
  let cursor = null;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { docs, next_cursor, has_more } = await listAcademySalesPage(academyId, {
      from,
      to,
      limit: PAGE_SIZE,
      cursor,
    });
    all.push(...docs);
    if (!has_more || !next_cursor) break;
    cursor = next_cursor;
    if (page === MAX_PAGES - 1 && has_more) {
      truncated = true;
      console.warn(
        JSON.stringify({
          event: 'sales_daily_report_truncated',
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

/** @param {string} academyId @param {string} dateYmd */
export async function buildSalesDailyReportPayload(academyId, dateYmd) {
  const { from, to } = parsePeriodBounds(dateYmd, dateYmd);
  const [{ docs: rawDocs, truncated }, { docs: rawPayments, truncated: payments_truncated }] =
    await Promise.all([
      listAllAcademySalesForDay(academyId, from, to),
      listStudentPaymentsForReportDay(academyId, dateYmd),
    ]);

  const itemsBySale = new Map();
  for (const doc of rawDocs) {
    const itemDocs = await listSaleItems(doc.$id);
    itemsBySale.set(doc.$id, itemDocs);
  }

  const leadIds = [
    ...rawDocs.map((d) => d.aluno_id).filter(Boolean),
    ...rawPayments.map((d) => d.lead_id).filter(Boolean),
  ];
  const leadNames = await loadLeadNames(leadIds);

  const mappedSales = [];
  for (const doc of rawDocs) {
    const itemDocs = itemsBySale.get(doc.$id) || [];
    const items = await enrichSaleItems(itemDocs);
    const mapped = mapSaleDoc(doc, items, leadNames);
    mapped.operator_name = String(doc.created_by_name || doc.created_by || '').trim() || null;
    mappedSales.push(mapped);
  }

  const mappedPayments = rawPayments.map((doc) => mapPaymentDocForDailyReport(doc, leadNames));
  const academyName = await loadAcademyName(academyId);

  return buildDailyReportPayload({
    dateYmd,
    academyName,
    mappedSales,
    rawSaleDocs: rawDocs,
    mappedPayments,
    rawPaymentDocs: rawPayments,
    truncated,
    payments_truncated,
  });
}

export default async function salesDailyReportHandler(req, res) {
  if (!DB_ID || !SALES_COL) {
    return json(res, 503, { ok: false, error: 'sales_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const dateYmd = parseReportDateYmd(req.query?.date);
  if (!dateYmd) {
    return json(res, 400, { ok: false, error: 'invalid_date' });
  }

  const format = String(req.query?.format || '').trim().toLowerCase();

  try {
    const payload = await buildSalesDailyReportPayload(academyId, dateYmd);

    if (format === 'pdf') {
      const buffer = await renderDailyReportPdfBuffer(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="fechamento-dia-${dateYmd}.pdf"`
      );
      return res.status(200).send(buffer);
    }

    return json(res, 200, payload);
  } catch (e) {
    console.error('[sales] daily_report:', e);
    return json(res, 500, { ok: false, error: apiErro(e, 'load') });
  }
}
