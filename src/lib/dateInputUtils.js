/** Utilitários para campos de data digitáveis (formato BR na UI, ISO no valor). */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_RE = /^\d{4}-\d{2}$/;
const ISO_DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isValidCalendarDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return false;
  const iso = `${year}-${pad2(month)}-${pad2(day)}`;
  const dt = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getFullYear() === year && dt.getMonth() + 1 === month && dt.getDate() === day;
}

export function isoDateToBr(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!ISO_DATE_RE.test(s)) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** Aceita string YYYY-MM-DD (com ou sem sufixo de hora). */
export function isIsoDateYmd(value) {
  return ISO_DATE_RE.test(String(value || '').trim().slice(0, 10));
}

/** Padrão: daqui a 30 dias (calendário local). */
export function defaultDeferredDueYmd(from = new Date()) {
  const base = from instanceof Date && !Number.isNaN(from.getTime()) ? from : new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 30);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseBrDateToIso(text) {
  const digits = String(text || '').replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (!isValidCalendarDate(year, month, day)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function maskBrDateTyping(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function isoMonthToBr(ym) {
  const s = String(ym || '').slice(0, 7);
  if (!ISO_MONTH_RE.test(s)) return '';
  const [y, m] = s.split('-');
  return `${m}/${y}`;
}

export function parseBrMonthToIso(text) {
  const digits = String(text || '').replace(/\D/g, '');
  if (digits.length !== 6) return null;
  const month = Number(digits.slice(0, 2));
  const year = Number(digits.slice(2, 6));
  if (month < 1 || month > 12 || year < 1900 || year > 2100) return null;
  return `${year}-${pad2(month)}`;
}

export function maskBrMonthTyping(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function isoDatetimeLocalToBr(iso) {
  const s = String(iso || '').trim();
  const m = s.match(ISO_DATETIME_LOCAL_RE);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

export function parseBrDatetimeToIsoLocal(text) {
  const digits = String(text || '').replace(/\D/g, '');
  if (digits.length !== 12) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const hour = Number(digits.slice(8, 10));
  const minute = Number(digits.slice(10, 12));
  if (!isValidCalendarDate(year, month, day)) return null;
  if (hour > 23 || minute > 59) return null;
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
}

export function maskBrDatetimeTyping(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 12);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  const datePart = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  if (digits.length <= 10) return `${datePart} ${digits.slice(8)}`;
  return `${datePart} ${digits.slice(8, 10)}:${digits.slice(10)}`;
}

export function isoValueToDisplay(type, value) {
  if (!value) return '';
  if (type === 'date') return isoDateToBr(value);
  if (type === 'month') return isoMonthToBr(value);
  if (type === 'datetime-local') return isoDatetimeLocalToBr(value);
  return String(value);
}

export function parseDisplayToIso(type, display) {
  if (!String(display || '').trim()) return '';
  if (type === 'date') return parseBrDateToIso(display) || null;
  if (type === 'month') return parseBrMonthToIso(display) || null;
  if (type === 'datetime-local') return parseBrDatetimeToIsoLocal(display) || null;
  return null;
}

export function maskDisplayTyping(type, raw) {
  if (type === 'date') return maskBrDateTyping(raw);
  if (type === 'month') return maskBrMonthTyping(raw);
  if (type === 'datetime-local') return maskBrDatetimeTyping(raw);
  return raw;
}

export function isDisplayComplete(type, display) {
  const s = String(display || '').trim();
  if (type === 'date') return s.length === 10;
  if (type === 'month') return s.length === 7;
  if (type === 'datetime-local') return s.length === 16;
  return false;
}

export const DATE_INPUT_PLACEHOLDERS = {
  date: 'dd/mm/aaaa',
  month: 'mm/aaaa',
  'datetime-local': 'dd/mm/aaaa hh:mm',
};
