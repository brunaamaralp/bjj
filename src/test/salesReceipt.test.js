import { describe, it, expect } from 'vitest';
import {
  buildReceiptText,
  escapeWhatsappBold,
  stripUnusedPlaceholders,
} from '../lib/salesReceipt';
import { DEFAULT_SALES_RECEIPT_TEMPLATE } from '../lib/salesSettings';
import { buildReceiptPaymentsText } from '../lib/salePayments';

describe('salesReceipt', () => {
  it('buildReceiptText substitutes placeholders', () => {
    const text = buildReceiptText({
      template: DEFAULT_SALES_RECEIPT_TEMPLATE,
      footer: 'Obrigado!',
      academyName: 'Academia Teste',
      saleId: 'abc123def456',
      date: '18/05/2026',
      time: '10:30',
      channel: 'presencial',
      clientName: 'Maria',
      items: [
        {
          display_label: 'Produto A · M',
          quantidade: 2,
          subtotal: 200,
          preco_unitario: 100,
        },
      ],
      total: 200,
      payment: 'pix',
    });
    expect(text).toContain('Academia Teste');
    expect(text).toContain('#F456');
    expect(text).toContain('2x Produto A · M');
    expect(text).toContain('R$');
    expect(text).toContain('Obrigado!');
  });

  it('uses short sale id and empty client name fallback', () => {
    const text = buildReceiptText({
      template: 'Cliente: {client_name}\nVenda {sale_id}',
      footer: '',
      academyName: 'A',
      saleId: 'x',
      date: '01/01/2026',
      time: '12:00',
      channel: 'presencial',
      clientName: '',
      items: [],
      total: 0,
      payment: 'pix',
    });
    expect(text).toContain('Cliente');
    expect(text).not.toContain('{client_name}');
  });

  it('escapes asterisks in product names for WhatsApp', () => {
    const text = buildReceiptText({
      template: '{items_lines}',
      footer: '',
      academyName: 'A',
      saleId: 'id1',
      date: '',
      time: '',
      channel: 'presencial',
      clientName: 'João',
      items: [{ display_label: 'Kimono * Azul', quantidade: 1, preco_unitario: 10, subtotal: 10 }],
      total: 10,
      payment: 'pix',
    });
    expect(text).toContain('\\*');
    expect(escapeWhatsappBold('a*b')).toBe('a\\*b');
  });

  it('preserves emoji in client and product names', () => {
    const text = buildReceiptText({
      template: '{client_name}\n{items_lines}',
      footer: '',
      academyName: 'A',
      saleId: 'id3',
      date: '',
      time: '',
      channel: 'presencial',
      clientName: '🥋 João',
      items: [{ display_label: 'Kimono 🟣', quantidade: 1, preco_unitario: 1, subtotal: 1 }],
      total: 1,
      payment: 'pix',
    });
    expect(text).toContain('🥋');
    expect(text).toContain('🟣');
  });

  it('handles ampersand in product label', () => {
    const text = buildReceiptText({
      template: '{items_lines}',
      footer: '',
      academyName: 'A',
      saleId: 'id2',
      date: '',
      time: '',
      channel: 'presencial',
      clientName: 'C',
      items: [{ display_label: 'Boné & Rash', quantidade: 1, preco_unitario: 5, subtotal: 5 }],
      total: 5,
      payment: 'pix',
    });
    expect(text).toContain('Boné & Rash');
  });

  it('strips unused placeholders from template', () => {
    const raw = 'Olá {client_name}\n{unused_field}\nTotal {total}';
    const out = stripUnusedPlaceholders(raw.replace('{total}', 'R$ 10'));
    expect(out).not.toContain('{unused_field}');
    expect(out).toContain('R$ 10');
  });

  it('includes client phone when provided', () => {
    const text = buildReceiptText({
      template: '{client_name}',
      footer: '',
      academyName: 'A',
      saleId: 'sale99',
      date: '',
      time: '',
      channel: 'presencial',
      clientName: 'Ana',
      clientPhone: '11999998888',
      items: [],
      total: 0,
      payment: 'pix',
    });
    expect(text).toContain('Ana');
    expect(text).toContain('11999998888');
  });

  it('buildReceiptPaymentsText lists multiple payments', () => {
    const section = buildReceiptPaymentsText(
      [
        { forma: 'pix', valor: 50 },
        { forma: 'dinheiro', valor: 30, troco: 5, forma_troco: 'pix' },
      ],
      80
    );
    expect(section).toContain('PIX');
    expect(section).toContain('Dinheiro');
    expect(section.toLowerCase()).toMatch(/pagamento|forma|total/i);
  });
});
