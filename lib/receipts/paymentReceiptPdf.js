import { readSalesSettings } from '../../src/lib/salesSettings.js';
import { parseAcademySettings } from '../../src/lib/stockSettings.js';
import { academyDisplayName } from './saleReceiptPdf.js';
import {
  buildPaymentReceiptText,
  isPaymentReceiptEligible,
  bundleReceiptPlanLine,
} from './paymentReceiptText.js';
import { textToPdfBuffer } from './textToPdfBuffer.js';
import { PAYMENT_CATEGORY, normalizePaymentCategory } from '../../src/lib/paymentCategories.js';

export async function generatePaymentReceiptPdfBuffer({
  payment,
  studentDoc,
  academyDoc,
  bundlePayments = [],
}) {
  const eligible = isPaymentReceiptEligible(payment);
  if (!eligible.ok) {
    const err = new Error(eligible.reason || 'payment_not_eligible');
    err.code = eligible.reason;
    throw err;
  }

  const settings = readSalesSettings(parseAcademySettings(academyDoc?.settings));
  const studentName = String(studentDoc?.name || studentDoc?.nome || 'Aluno').trim() || 'Aluno';

  let planName = String(payment.plan_name || '').trim();
  const cat = normalizePaymentCategory(payment.payment_category);
  if (cat === PAYMENT_CATEGORY.BUNDLE) {
    const bundleLine = bundleReceiptPlanLine(payment);
    if (bundleLine) planName = bundleLine;
  }

  const text = buildPaymentReceiptText({
    footer: settings.receiptFooter,
    academyName: academyDisplayName(academyDoc),
    studentName,
    payment: { ...payment, plan_name: planName || payment.plan_name },
    bundlePayments,
  });

  return textToPdfBuffer(text);
}
