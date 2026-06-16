/** Formas de pagamento canônicas (value snake_case) — Vendas, mensalidades e relatórios. */
export const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outro', label: 'Outro' },
];

const CANONICAL_METHOD_VALUES = new Set(PAYMENT_METHODS.map((m) => m.value));

/** Variantes legadas / acentuadas → chave canônica. */
export const PAYMENT_METHOD_ALIASES = {
  'cartão_crédito': 'cartao_credito',
  'cartão crédito': 'cartao_credito',
  'cartao crédito': 'cartao_credito',
  'cartão credito': 'cartao_credito',
  'cartao credito': 'cartao_credito',
  credito: 'cartao_credito',
  credito_avista: 'cartao_credito',
  credit: 'cartao_credito',
  'cartão_débito': 'cartao_debito',
  'cartão débito': 'cartao_debito',
  'cartao débito': 'cartao_debito',
  'cartão debito': 'cartao_debito',
  'cartao debito': 'cartao_debito',
  debito: 'cartao_debito',
  debit: 'cartao_debito',
  transferência: 'transferencia',
  transferencia: 'transferencia',
  cash: 'dinheiro',
  credito_parcelado: 'credito_parcelado',
};

/** Canônico → dialect gravado em mensalidades / transações / preferredPaymentMethod legado. */
const STORAGE_DIALECT_BY_CANONICAL = {
  cartao_credito: 'cartão_crédito',
  cartao_debito: 'cartão_débito',
  transferencia: 'transferência',
};

const STORAGE_DIALECT_VALUES = new Set([
  'pix',
  'dinheiro',
  'cartão_crédito',
  'cartão_débito',
  'transferência',
]);

const LABEL_BY_VALUE = Object.fromEntries(PAYMENT_METHODS.map((o) => [o.value, o.label]));

/**
 * Normaliza forma de pagamento para chave canônica (conta bancária, taxas, etc.).
 * @param {string|null|undefined} method
 */
export function canonicalPaymentMethodKey(method) {
  const key = String(method || '').trim().toLowerCase();
  if (!key) return '';
  if (CANONICAL_METHOD_VALUES.has(key)) return key;
  return PAYMENT_METHOD_ALIASES[key] || key;
}

/**
 * NL / texto livre: trim, lowercase, espaços colapsados; underscore se não houver alias direto.
 * @param {string|null|undefined} raw
 */
export function normalizePaymentMethodInput(raw) {
  const collapsed = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!collapsed) return '';
  if (PAYMENT_METHOD_ALIASES[collapsed]) return collapsed;
  const underscored = collapsed.replace(/ /g, '_');
  if (PAYMENT_METHOD_ALIASES[underscored]) return underscored;
  return underscored;
}

/** Atalho: entrada livre → chave canônica. */
export function canonicalPaymentMethodKeyFromInput(raw) {
  return canonicalPaymentMethodKey(normalizePaymentMethodInput(raw));
}

/**
 * Dialect legado para persistência (mensalidades, transações, NL).
 * @param {string|null|undefined} method
 */
export function toStorageDialectMethod(method) {
  const key = canonicalPaymentMethodKey(method);
  if (!key) return '';
  return STORAGE_DIALECT_BY_CANONICAL[key] || key;
}

/** @param {string|null|undefined} dialect */
export function isKnownStorageDialectMethod(dialect) {
  return STORAGE_DIALECT_VALUES.has(String(dialect || '').trim());
}

/**
 * Método sujeito a taxa de cartão configurada em financeConfig.cardFees.
 * @param {string} canonical — resultado de canonicalPaymentMethodKey
 * @param {number|string|null|undefined} [installments]
 */
export function isCardPaymentMethod(canonical) {
  if (canonical === 'cartao_debito') return true;
  if (canonical === 'credito_parcelado') return true;
  if (canonical === 'cartao_credito') return true;
  return false;
}

/** Usa taxa parcelada quando método é parcelado ou crédito com 2+ parcelas. */
export function usesInstallmentCardFee(canonical, installments) {
  if (canonical === 'credito_parcelado') return true;
  if (canonical === 'cartao_credito' && Number(installments) >= 2) return true;
  return false;
}

/** @param {string|null|undefined} value */
export function paymentMethodLabel(value) {
  const key = canonicalPaymentMethodKey(value);
  return LABEL_BY_VALUE[key] || null;
}
