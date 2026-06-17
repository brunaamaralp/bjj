/**
 * Handoff conciliação → fechamento mensal (cash_closing).
 */
import { civilMonthsOverlappingPeriod } from '../../src/lib/closingPeriodMonths.js';
import { formatMonthTitleCapitalized } from '../../src/lib/financeiroOverview.js';
import { getCashClosing } from './financeClosingData.js';

/**
 * @param {{ academyId: string, periodStart: string, periodEnd: string }} params
 * @returns {Promise<{ months: object[], all_conferred: boolean, any_conferred: boolean } | null>}
 */
export async function buildClosingHintsForStatement({ academyId, periodStart, periodEnd }) {
  const monthsYm = civilMonthsOverlappingPeriod(periodStart, periodEnd);
  if (!monthsYm.length) return null;

  const months = await Promise.all(
    monthsYm.map(async (reference_month) => {
      const doc = await getCashClosing(academyId, reference_month);
      return {
        reference_month,
        month_label: formatMonthTitleCapitalized(reference_month),
        is_conferred: Boolean(doc),
        closed_at: doc?.closed_at || undefined,
      };
    })
  );

  return {
    months,
    all_conferred: months.every((row) => row.is_conferred),
    any_conferred: months.some((row) => row.is_conferred),
  };
}
