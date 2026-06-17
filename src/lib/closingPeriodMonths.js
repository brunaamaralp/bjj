/**
 * Mapeia período de extrato bancário (YYYY-MM-DD) → meses civis (YYYY-MM) que intersectam o intervalo.
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} periodStart YYYY-MM-DD
 * @param {string} periodEnd YYYY-MM-DD
 * @returns {string[]} YYYY-MM ordenados, sem duplicatas
 */
export function civilMonthsOverlappingPeriod(periodStart, periodEnd) {
  const start = String(periodStart || '').slice(0, 10);
  const end = String(periodEnd || '').slice(0, 10);
  if (!YMD_RE.test(start) || !YMD_RE.test(end) || start > end) return [];

  const out = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const endY = Number(end.slice(0, 4));
  const endM = Number(end.slice(5, 7));

  while (y < endY || (y === endY && m <= endM)) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    const monthFirst = `${ym}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const monthLast = `${ym}-${String(lastDay).padStart(2, '0')}`;
    if (start <= monthLast && end >= monthFirst) out.push(ym);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return out;
}
