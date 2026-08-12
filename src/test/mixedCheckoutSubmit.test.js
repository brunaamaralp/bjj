import { describe, it, expect, vi } from 'vitest';
import { submitMixedCheckout } from '../lib/mixedCheckoutSubmit.js';

describe('submitMixedCheckout', () => {
  it('só venda chama createSale', async () => {
    const createSale = vi.fn(async () => ({ $id: 'sale1' }));
    const createPayment = vi.fn();
    const cancelSale = vi.fn();
    const r = await submitMixedCheckout({
      deps: { createSale, createPayment, cancelSale },
      salePayload: { itens: [{ quantidade: 1 }], pagamentos: [], idempotency_key: 'k1' },
      paymentPayloads: [],
    });
    expect(r.ok).toBe(true);
    expect(r.sale?.$id).toBe('sale1');
    expect(createPayment).not.toHaveBeenCalled();
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it('só cobranças chama createPayment em série', async () => {
    const createSale = vi.fn();
    const createPayment = vi
      .fn()
      .mockResolvedValueOnce({ $id: 'p1' })
      .mockResolvedValueOnce({ $id: 'p2' });
    const cancelSale = vi.fn();
    const r = await submitMixedCheckout({
      deps: { createSale, createPayment, cancelSale },
      salePayload: null,
      paymentPayloads: [
        { lead_id: 'L', academy_id: 'A', amount: 10 },
        { lead_id: 'L', academy_id: 'A', amount: 20 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.payments).toHaveLength(2);
    expect(createSale).not.toHaveBeenCalled();
  });

  it('compensa venda se createPayment falhar', async () => {
    const createSale = vi.fn(async () => ({ $id: 'sale1' }));
    const createPayment = vi.fn(async () => {
      throw new Error('dup');
    });
    const cancelSale = vi.fn(async () => ({ ok: true }));
    const r = await submitMixedCheckout({
      deps: { createSale, createPayment, cancelSale },
      salePayload: { itens: [{}], pagamentos: [], idempotency_key: 'k1' },
      paymentPayloads: [{ lead_id: 'L', academy_id: 'A', amount: 10 }],
    });
    expect(r.ok).toBe(false);
    expect(cancelSale).toHaveBeenCalledWith(
      expect.objectContaining({
        venda_id: 'sale1',
        motivo: expect.stringMatching(/checkout misto/i),
      })
    );
  });

  it('misto sucesso retorna sale e payments', async () => {
    const createSale = vi.fn(async () => ({ $id: 'sale1' }));
    const createPayment = vi.fn(async () => ({ $id: 'p1' }));
    const cancelSale = vi.fn();
    const r = await submitMixedCheckout({
      deps: { createSale, createPayment, cancelSale },
      salePayload: { itens: [{}], pagamentos: [], idempotency_key: 'k1' },
      paymentPayloads: [{ lead_id: 'L', academy_id: 'A', amount: 10 }],
    });
    expect(r.ok).toBe(true);
    expect(r.sale.$id).toBe('sale1');
    expect(r.payments[0].$id).toBe('p1');
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it('emite onProgress por etapa', async () => {
    const onProgress = vi.fn();
    const createSale = vi.fn(async () => ({ $id: 'sale1' }));
    const createPayment = vi
      .fn()
      .mockResolvedValueOnce({ $id: 'p1' })
      .mockResolvedValueOnce({ $id: 'p2' });
    await submitMixedCheckout({
      deps: { createSale, createPayment, cancelSale: vi.fn() },
      salePayload: { itens: [{}], pagamentos: [], idempotency_key: 'k1' },
      paymentPayloads: [
        { lead_id: 'L', academy_id: 'A', amount: 10, payment_category: 'plan' },
        { lead_id: 'L', academy_id: 'A', amount: 5, payment_category: 'fee' },
      ],
      onProgress,
    });
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      { stage: 'sale', label: 'Registrando venda…' },
      { stage: 'payment', index: 0, total: 2, label: 'Registrando mensalidade (1/2)…' },
      { stage: 'payment', index: 1, total: 2, label: 'Registrando taxa (2/2)…' },
      { stage: 'done', label: 'Concluído' },
    ]);
  });
});
