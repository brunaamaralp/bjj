import { describe, it, expect } from 'vitest';
import { renderPaymentReceiptPdfBuffer } from '../../lib/receipts/renderPaymentReceiptPdf.js';
import { PAYMENT_CATEGORY } from '../lib/paymentCategories.js';

describe('renderPaymentReceiptPdf', () => {
  it('gera um PDF válido para mensalidade paga', async () => {
    const buf = await renderPaymentReceiptPdfBuffer({
      payment: {
        $id: 'pay1234567890abcd',
        status: 'paid',
        amount: 150,
        paid_amount: 150,
        method: 'pix',
        plan_name: 'Mensal',
        reference_month: '2026-08',
        paid_at: '2026-08-17T14:30:00.000Z',
        registered_by_name: 'Recepção',
        payment_category: PAYMENT_CATEGORY.PLAN,
        note: 'Pagamento com emoji 🥋 e traço — ok',
      },
      studentDoc: { name: 'João Silva' },
      academyDoc: { name: 'Academia Teste', settings: '{}' },
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(500);
  });
});
