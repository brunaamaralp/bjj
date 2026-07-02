import { salesFetch } from './salesApi';

/** @param {string} dateYmd — YYYY-MM-DD */
export async function fetchSalesDailyReport(dateYmd) {
  const date = String(dateYmd || '').trim();
  return salesFetch(`/api/sales?action=daily_report&date=${encodeURIComponent(date)}`);
}
