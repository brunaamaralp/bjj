/** Formas de pagamento canônicas (value snake_case) — Vendas, mensalidades e relatórios. */
export const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outro', label: 'Outro' },
];

const LABEL_BY_VALUE = Object.fromEntries(PAYMENT_METHODS.map((o) => [o.value, o.label]));

/** @param {string|null|undefined} value */
export function paymentMethodLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return LABEL_BY_VALUE[key] || null;
}
