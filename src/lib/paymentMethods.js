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

/** Canônicos que usam dialect acentuado em mensalidades, transações e perfil do aluno. */
const STORAGE_DIALECT_CANONICALS = PAYMENT_METHODS.map((m) => m.value).filter((v) => v !== 'outro');

/** Labels curtos em modais operacionais (Mensalidades, perfil). */
const STORAGE_DIALECT_SHORT_LABELS = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão crédito',
  cartao_debito: 'Cartão débito',
  transferencia: 'Transferência',
};

/** Ordem visual no modal de pagamento de Mensalidades. */
export const STORAGE_DIALECT_MODAL_ORDER = [
  'pix',
  STORAGE_DIALECT_BY_CANONICAL.cartao_debito,
  STORAGE_DIALECT_BY_CANONICAL.cartao_credito,
  'dinheiro',
  STORAGE_DIALECT_BY_CANONICAL.transferencia,
];

/** Dialect gravado para cartão de crédito (mensalidades / transações). */
export const STORAGE_CREDIT_METHOD = STORAGE_DIALECT_BY_CANONICAL.cartao_credito;

/** Dialect gravado para cartão de débito. */
export const STORAGE_DEBIT_METHOD = STORAGE_DIALECT_BY_CANONICAL.cartao_debito;

/**
 * Opções de select com valores no dialect de storage (acentuado onde aplicável).
 * @param {{ labelStyle?: 'short' | 'full' }} [opts]
 */
export function storageDialectPaymentMethodOptions({ labelStyle = 'short' } = {}) {
  return STORAGE_DIALECT_CANONICALS.map((canonical) => {
    const value = toStorageDialectMethod(canonical);
    const fullLabel = LABEL_BY_VALUE[canonical] || value;
    const label =
      labelStyle === 'full' ? fullLabel : STORAGE_DIALECT_SHORT_LABELS[canonical] || fullLabel;
    return { value, label, canonical };
  });
}

/** Lista ordenada para o grid de métodos no modal de Mensalidades. */
export function orderedStorageDialectMethodsForModal() {
  const byValue = Object.fromEntries(
    storageDialectPaymentMethodOptions().map((o) => [o.value, o])
  );
  return STORAGE_DIALECT_MODAL_ORDER.map((v) => byValue[v]).filter(Boolean);
}

/** Mapa value (dialect) → label curto — exibição em listas. */
export function storageDialectMethodLabelsMap() {
  return Object.fromEntries(storageDialectPaymentMethodOptions().map((o) => [o.value, o.label]));
}

/** @param {string|null|undefined} method */
export function storageDialectMethodLabel(method) {
  const key = canonicalPaymentMethodKey(method);
  if (!key) return '—';
  const dialect = toStorageDialectMethod(key);
  return STORAGE_DIALECT_SHORT_LABELS[key] || LABEL_BY_VALUE[key] || dialect;
}

/** Crédito no dialect de storage ou canônico equivalente. */
export function isStorageCreditMethod(method) {
  return canonicalPaymentMethodKey(method) === 'cartao_credito';
}

/**
 * Normaliza para dialect gravado em mensalidades/transações; fallback se desconhecido.
 * @param {string|null|undefined} method
 * @param {string} [fallback='dinheiro']
 */
export function normalizeToStorageDialect(method, fallback = 'dinheiro') {
  const key = canonicalPaymentMethodKey(method);
  if (!key) return fallback;
  const dialect = toStorageDialectMethod(key);
  return isKnownStorageDialectMethod(dialect) ? dialect : fallback;
}

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

/**
 * Métodos cuja taxa em financeConfig.cardFees pode repassar ao aluno (mensalidade).
 * @param {string} canonical — resultado de canonicalPaymentMethodKey
 */
export function isPlanFeeEligiblePaymentMethod(canonical) {
  if (canonical === 'pix') return true;
  return isCardPaymentMethod(canonical);
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
