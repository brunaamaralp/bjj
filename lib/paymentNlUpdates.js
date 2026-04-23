/**
 * Campos permitidos para patch de documento de mensalidade via NL (update_payment).
 * Chaves em snake_case, alinhadas a `studentPayments` / Appwrite.
 */
const ALLOWED_KEYS = new Set(['note', 'account', 'plan_name']);

function clip(s, max) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * @param {Record<string, unknown>} data — pode trazer `updates` ou chaves flat
 * @returns {Record<string, string>}
 */
export function sanitizePaymentUpdatesForNl(data) {
  const src = data && typeof data === 'object' ? data : {};
  const rawUpdates =
    src.updates && typeof src.updates === 'object' && !Array.isArray(src.updates) ? { ...src.updates } : {};
  for (const k of ALLOWED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined && src[k] !== null) {
      rawUpdates[k] = src[k];
    }
  }
  /** @type {Record<string, string>} */
  const out = {};
  const maxByKey = { note: 2000, account: 128, plan_name: 200 };
  for (const key of ALLOWED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rawUpdates, key)) continue;
    const v = rawUpdates[key];
    if (v === undefined || v === null) continue;
    const s = clip(String(v), maxByKey[key] || 500);
    if (s) out[key] = s;
  }
  return out;
}
