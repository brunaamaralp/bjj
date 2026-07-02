/**
 * Leituras de mensalidades e vendas recebidas no intervalo (Visão Geral).
 */
import { parsePeriodBounds, saleInPeriod } from '../../src/lib/salesHistory.js';
import { listAcademySalesPage } from './salesHistoryHandler.js';
import { listStudentPaymentsReceivedInPeriod } from './dailyReportStudentPayments.js';

const MAX_SALE_PAGES = 20;

export async function listConcludedSalesForPeriod(academyId, fromYmd, toYmd) {
  const { from, to } = parsePeriodBounds(fromYmd, toYmd);
  const all = [];
  let cursor = null;

  for (let page = 0; page < MAX_SALE_PAGES; page += 1) {
    const { docs, next_cursor, has_more } = await listAcademySalesPage(academyId, {
      from,
      to,
      limit: 100,
      cursor,
    });
    for (const doc of docs || []) {
      if (String(doc?.status || '').toLowerCase() !== 'concluida') continue;
      if (!saleInPeriod(doc, from, to)) continue;
      all.push(doc);
    }
    if (!has_more || !next_cursor) break;
    cursor = next_cursor;
  }

  return all;
}

export async function loadOverviewCashInflowExtras(academyId, fromYmd, toYmd) {
  const [paymentsResult, sales] = await Promise.all([
    listStudentPaymentsReceivedInPeriod(academyId, fromYmd, toYmd),
    listConcludedSalesForPeriod(academyId, fromYmd, toYmd),
  ]);

  return {
    payments: paymentsResult.docs || [],
    sales,
    paymentsTruncated: Boolean(paymentsResult.truncated),
  };
}
