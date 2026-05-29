import { describe, it, expect } from 'vitest';
import { renderReceiptPdf, receiptGeneratedAt } from '../../lib/receipts/receiptPdfLayout.js';

describe('receiptPdfLayout', () => {
  it('renderReceiptPdf produces a valid PDF buffer', async () => {
    const buf = await renderReceiptPdf((ctx) => {
      ctx.drawHeader({
        academyName: 'Academia Teste',
        docTitle: 'Comprovante',
        metaLine: '#1234 · 29/05/2026',
      });
      ctx.keyValueRows([{ label: 'Cliente', value: 'Maria' }]);
      ctx.totalBox({ label: 'Total', amount: 'R$ 100,00' });
      ctx.footer({ message: 'Obrigado!', generatedAt: receiptGeneratedAt() });
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(500);
  });
});
