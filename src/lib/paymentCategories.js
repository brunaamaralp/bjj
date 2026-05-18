/** Categorias de pagamento em `student_payments`. */
export const PAYMENT_CATEGORY = {
  PLAN: 'plan',
  BUNDLE: 'bundle',
  FEE: 'fee',
  OTHER: 'other',
};

const VALID = new Set(Object.values(PAYMENT_CATEGORY));

/**
 * Normaliza categoria; registros antigos sem campo contam como mensalidade (`plan`).
 * @param {string|{ payment_category?: string }|null|undefined} value
 */
export function normalizePaymentCategory(value) {
  const raw =
    value && typeof value === 'object'
      ? value.payment_category
      : value;
  const c = String(raw || '').trim().toLowerCase();
  if (VALID.has(c)) return c;
  return PAYMENT_CATEGORY.PLAN;
}

/** Exibir na grade de Mensalidades (plan + bundle + legado). */
export function isMensalidadesGridPayment(doc) {
  const cat = normalizePaymentCategory(doc);
  return cat === PAYMENT_CATEGORY.PLAN || cat === PAYMENT_CATEGORY.BUNDLE;
}

/** Upsert por (lead_id, reference_month) só para plan e bundle. */
export function shouldUpsertByReferenceMonth(category) {
  const cat = normalizePaymentCategory(category);
  return cat === PAYMENT_CATEGORY.PLAN || cat === PAYMENT_CATEGORY.BUNDLE;
}

/** Mês filho de pacote (não é o âncora). */
export function isBundleChildPayment(doc) {
  if (normalizePaymentCategory(doc) !== PAYMENT_CATEGORY.BUNDLE) return false;
  const origin = String(doc?.bundle_origin_id || '').trim();
  const id = String(doc?.$id || '').trim();
  return Boolean(origin && id && origin !== id);
}

/** Documento âncora de pacote (primeiro mês / pagamento total). */
export function isBundleAnchorPayment(doc) {
  if (normalizePaymentCategory(doc) !== PAYMENT_CATEGORY.BUNDLE) return false;
  const origin = String(doc?.bundle_origin_id || '').trim();
  const id = String(doc?.$id || '').trim();
  return !origin || (id && origin === id);
}

/**
 * @param {string} startYm YYYY-MM
 * @param {number} count
 * @returns {string[]}
 */
export function enumerateCoverageMonths(startYm, count) {
  const ym = String(startYm || '').trim();
  const n = Math.max(1, Math.min(24, Number(count) || 1));
  if (!/^\d{4}-\d{2}$/.test(ym)) return [];
  const [y0, m0] = ym.split('-').map(Number);
  const out = [];
  let y = y0;
  let m = m0;
  for (let i = 0; i < n; i += 1) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export const BUNDLE_DURATION_OPTIONS = [
  { months: 3, label: 'Trimestral (3 meses)' },
  { months: 6, label: 'Semestral (6 meses)' },
  { months: 12, label: 'Anual (12 meses)' },
];
