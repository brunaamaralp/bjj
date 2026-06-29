/** Bandeiras de cartão para taxas por recebedor. */

export const CARD_BRANDS = [
  'default',
  'visa',
  'mastercard',
  'elo',
  'amex',
  'hipercard',
  'other',
];

/** Bandeiras exibidas na UI de pagamento (sem default). */
export const CARD_BRANDS_SELECTABLE = CARD_BRANDS.filter((b) => b !== 'default');

export const CARD_BRAND_UI_LABELS = {
  default: 'Padrão',
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'Amex',
  hipercard: 'Hipercard',
  other: 'Outras',
};

const ALIASES = {
  visa: 'visa',
  master: 'mastercard',
  mastercard: 'mastercard',
  mc: 'mastercard',
  elo: 'elo',
  amex: 'amex',
  americanexpress: 'amex',
  hiper: 'hipercard',
  hipercard: 'hipercard',
  other: 'other',
  outras: 'other',
  default: 'default',
};

export function normalizeCardBrand(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!key) return 'default';
  return ALIASES[key] || (CARD_BRANDS.includes(key) ? key : 'other');
}

export function isSelectableCardBrand(raw) {
  const brand = normalizeCardBrand(raw);
  return brand !== 'default' && brand !== 'other' ? true : brand === 'other';
}
