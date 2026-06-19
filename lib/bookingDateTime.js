/**
 * Utilitários de data/hora com timezone (agendamento).
 * Default: America/Sao_Paulo.
 */

const WEEKDAY_SHORT_TO_CODE = {
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
};

/** @param {Date} date @param {string} timeZone */
function tzOffsetMs(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  /** @type {Record<string, string>} */
  const filled = {};
  for (const p of parts) {
    if (p.type !== 'literal') filled[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(filled.year),
    Number(filled.month) - 1,
    Number(filled.day),
    Number(filled.hour),
    Number(filled.minute),
    Number(filled.second)
  );
  return asUtc - date.getTime();
}

/**
 * Converte data local (YMD + HH:MM) para ISO UTC.
 * @param {string} dateYmd
 * @param {string} timeHHMM
 * @param {string} timeZone
 */
export function localDateTimeToUtcIso(dateYmd, timeHHMM, timeZone) {
  const [y, m, d] = String(dateYmd || '').split('-').map(Number);
  const [hh, mm] = String(timeHHMM || '00:00').split(':').map(Number);
  if (!y || !m || !d) throw new Error('date_invalid');
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const offset = tzOffsetMs(timeZone, guess);
  return new Date(guess.getTime() - offset).toISOString();
}

/**
 * YMD de hoje na timezone informada.
 * @param {string} [timeZone]
 * @param {Date} [ref]
 */
export function todayYmdInTz(timeZone = 'America/Sao_Paulo', ref = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ref);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return y && m && d ? `${y}-${m}-${d}` : ref.toISOString().slice(0, 10);
}

/**
 * Código de dia da semana (mon..sun) para YMD na timezone.
 * @param {string} dateYmd
 * @param {string} [timeZone]
 */
export function weekdayCodeInTz(dateYmd, timeZone = 'America/Sao_Paulo') {
  const iso = localDateTimeToUtcIso(dateYmd, '12:00', timeZone);
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(iso));
  return WEEKDAY_SHORT_TO_CODE[short] || 'mon';
}

/**
 * Soma dias a um YMD na timezone (evita drift de DST usando meio-dia local).
 * @param {string} dateYmd
 * @param {number} days
 * @param {string} [timeZone]
 */
export function addDaysYmd(dateYmd, days, timeZone = 'America/Sao_Paulo') {
  const base = new Date(localDateTimeToUtcIso(dateYmd, '12:00', timeZone));
  base.setUTCDate(base.getUTCDate() + days);
  return todayYmdInTz(timeZone, base);
}

/**
 * Lista YMD de start até start+count-1 (inclusive).
 * @param {string} startYmd
 * @param {number} count
 * @param {string} [timeZone]
 */
export function dateRangeYmd(startYmd, count, timeZone = 'America/Sao_Paulo') {
  const out = [];
  let cur = startYmd;
  for (let i = 0; i < count; i += 1) {
    out.push(cur);
    cur = addDaysYmd(cur, 1, timeZone);
  }
  return out;
}
