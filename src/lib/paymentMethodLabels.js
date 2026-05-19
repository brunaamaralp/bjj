/** Labels de exibição para `method` (snake_case ou variantes legadas). */
const PAYMENT_METHOD_LABELS = {
  pix: 'PIX',
  cartao_credito: 'Cartão de crédito',
  'cartão_crédito': 'Cartão de crédito',
  credito: 'Cartão de crédito',
  credit: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  'cartão_débito': 'Cartão de débito',
  debito: 'Cartão de débito',
  debit: 'Cartão de débito',
  dinheiro: 'Dinheiro',
  cash: 'Dinheiro',
  transferencia: 'Transferência',
  transferência: 'Transferência',
  link_pagamento: 'Link de pagamento',
  boleto: 'Boleto',
  outro: 'Outro',
};

const CREDIT_METHOD_KEYS = new Set([
  'cartao_credito',
  'cartão_crédito',
  'credito',
  'credit',
]);

/**
 * @param {string|null|undefined} method
 * @param {number|null|undefined} [installments]
 */
export function formatPaymentMethod(method, installments) {
  const raw = String(method || '').trim();
  if (!raw) return '—';
  const key = raw.toLowerCase();
  const base = PAYMENT_METHOD_LABELS[key] || raw;
  const inst = Number(installments);
  if (inst > 1 && (CREDIT_METHOD_KEYS.has(key) || /cr[eé]dito/i.test(base))) {
    return `${base} ${inst}x`;
  }
  return base;
}
