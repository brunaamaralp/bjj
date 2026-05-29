import { isPaymentReceiptEligible } from './paymentReceiptText.js';
import { renderPaymentReceiptPdfBuffer } from './renderPaymentReceiptPdf.js';

export async function generatePaymentReceiptPdfBuffer(opts) {
  const eligible = isPaymentReceiptEligible(opts.payment);
  if (!eligible.ok) {
    const err = new Error(eligible.reason || 'payment_not_eligible');
    err.code = eligible.reason;
    throw err;
  }
  return renderPaymentReceiptPdfBuffer(opts);
}
