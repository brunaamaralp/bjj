import { describe, it, expect } from 'vitest';
import { renderSaleReceiptPdfBuffer } from '../../lib/receipts/renderSaleReceiptPdf.js';

describe('renderSaleReceiptPdf', () => {
  it('gera um PDF válido para venda com itens', async () => {
    const buf = await renderSaleReceiptPdfBuffer(
      {
        $id: '6a7cef000000000000000000682b46',
        $createdAt: '2026-08-17T20:00:00.000Z',
        cliente_nome: 'Maria',
        cliente_telefone: '11999998888',
        canal: 'presencial',
        total: 200,
        pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 200 }]),
        forma_pagamento: 'pix',
      },
      [
        {
          display_label: 'Kimono A1',
          quantidade: 2,
          preco_unitario: 100,
          subtotal: 200,
        },
      ],
      {},
      { name: 'Academia Teste', settings: '{}' }
    );

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(500);
  });
});
