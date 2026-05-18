import { describe, it, expect } from 'vitest';
import { buildReceiptText } from '../lib/salesReceipt';
import { DEFAULT_SALES_RECEIPT_TEMPLATE } from '../lib/salesSettings';

describe('salesReceipt', () => {
  it('buildReceiptText substitutes placeholders', () => {
    const text = buildReceiptText({
      template: DEFAULT_SALES_RECEIPT_TEMPLATE,
      footer: 'Obrigado!',
      academyName: 'Academia Teste',
      saleId: 'abc123',
      date: '18/05/2026',
      time: '10:30',
      channel: 'presencial',
      clientName: 'Maria',
      items: [
        { display_label: 'Produto A · M', quantidade: 2, pretotal: 100, subtotal: 200, preco_unitario: 100 },
      ],
      total: 200,
      payment: 'pix',
    });
    expect(text).toContain('Academia Teste');
    expect(text).toContain('abc123');
    expect(text).toContain('2x Produto A · M');
    expect(text).toContain('R$');
    expect(text).toContain('Obrigado!');
  });
});
