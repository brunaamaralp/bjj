import { parseMaskToCents, centsToNumber } from './moneyBr.js';

export function isCashPaymentMethod(method) {
  return String(method || '').trim().toLowerCase() === 'dinheiro';
}

export function parseCashReceivedAmount(payForm) {
  const raw = payForm?.cash_received ?? payForm?.cashReceived ?? '';
  if (raw === '' || raw == null) return null;
  const cents = parseMaskToCents(raw);
  if (cents == null) return null;
  return centsToNumber(cents);
}

/** Troco em reais (recebido − valor da mensalidade). */
export function computeTrocoFromPayForm(payForm, amountNum) {
  if (!isCashPaymentMethod(payForm?.method)) return 0;
  const amount = Number(amountNum);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const received = parseCashReceivedAmount(payForm);
  if (received == null) return 0;
  return Math.max(0, Math.round((received - amount) * 100) / 100);
}

export function validateStudentPaymentTroco(payForm, amountNum) {
  if (!isCashPaymentMethod(payForm?.method)) return { ok: true };
  const amount = Number(amountNum);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: true };
  const received = parseCashReceivedAmount(payForm);
  if (received == null) return { ok: true };
  if (received + 0.004 < amount) {
    return { ok: false, message: 'Valor recebido em dinheiro é menor que o valor da mensalidade.' };
  }
  return { ok: true };
}

export function trocoFieldsForPaymentPayload(payForm, amountNum) {
  const troco = computeTrocoFromPayForm(payForm, amountNum);
  if (troco <= 0) return {};
  const formaTroco = String(payForm?.formaTroco || payForm?.forma_troco || 'pix').trim() || 'pix';
  return { troco, forma_troco: formaTroco };
}
