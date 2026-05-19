/** Eventos para abrir formulários com dados do assistente NL (botão Corrigir). */

export const NL_SALE_PREFILL_EVENT = 'navi-nl-sale-prefill';
export const NL_PAYMENT_PREFILL_EVENT = 'navi-nl-payment-prefill';

export function dispatchNlSalePrefill(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NL_SALE_PREFILL_EVENT, { detail }));
}

export function dispatchNlPaymentPrefill(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NL_PAYMENT_PREFILL_EVENT, { detail }));
}

export function buildSalePrefillFromParsed(parsed) {
  const d = parsed?.data || {};
  return {
    aluno_id: d.student_id || '',
    aluno_nome: d.student_name || '',
    customer_name: d.customer_name || '',
    customer_phone: d.customer_phone || '',
    stock_item_id: d.stock_item_id || '',
    product_name: d.product_name || '',
    quantity: Number(d.quantity) || 1,
    unit_price: Number(d.unit_price),
    payment_form: d.payment_form || d.method || 'pix',
  };
}

export function buildPaymentPrefillFromParsed(parsed) {
  const d = parsed?.data || {};
  return {
    student_id: d.student_id || '',
    student_name: d.student_name || '',
    reference_month: d.reference_month || '',
    amount: d.amount != null && d.amount !== '' ? String(d.amount) : '',
    method: d.method || 'pix',
    plan_name: d.plan_name || '',
    note: d.note || '',
    status: 'paid',
  };
}
