/**
 * Normalização de data/hora para comandos NL (agendar experimental).
 * Usado no servidor (nlActionHandler) e no cliente (useNlAction).
 */

/** @param {string} raw */
export function normalizeScheduleTime(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!s) return '';
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Math.min(23, Math.max(0, Number(m[1])));
    const min = Math.min(59, Math.max(0, Number(m[2])));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})h(\d{2})$/);
  if (m) {
    const h = Math.min(23, Math.max(0, Number(m[1])));
    const min = Math.min(59, Math.max(0, Number(m[2])));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})h$/);
  if (m) {
    const h = Math.min(23, Math.max(0, Number(m[1])));
    return `${String(h).padStart(2, '0')}:00`;
  }
  return '';
}

/** @param {string} s */
export function isValidYmd(s) {
  const t = String(s || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}
