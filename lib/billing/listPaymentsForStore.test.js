import { describe, it, expect } from 'vitest';

describe('listPaymentsForStore merge', () => {
  it('dedupe por id mantém invoiceUrl do Asaas', () => {
    const byId = new Map();
    byId.set('pay_1', { id: 'pay_1', value: '297', status: 'CONFIRMED', invoiceUrl: null });
    const norm = { id: 'pay_1', value: '297', status: 'PENDING', invoiceUrl: 'https://asaas.test/inv' };
    const existing = byId.get(norm.id);
    byId.set(norm.id, { ...norm, ...existing, invoiceUrl: norm.invoiceUrl || existing?.invoiceUrl || null });
    expect(byId.get('pay_1').invoiceUrl).toBe('https://asaas.test/inv');
  });
});
