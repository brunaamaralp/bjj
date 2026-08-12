import { describe, it, expect } from 'vitest';
import {
  sumMixedCartCents,
  validateMixedCart,
  allocatePaymentsForMixedCheckout,
  buildSalePayloadFromMixed,
  buildStudentPaymentPayloadsFromMixed,
  summarizeMixedCheckout,
} from '../lib/mixedCheckout.js';

describe('mixedCheckout', () => {
  it('soma produtos e cobranças em centavos', () => {
    expect(
      sumMixedCartCents({
        productLines: [{ quantidade: 2, preco_unitario: 100 }],
        chargeLines: [{ amount: 150 }, { amount: 50 }],
      })
    ).toBe(40000);
  });

  it('exige aluno quando há cobrança', () => {
    const r = validateMixedCart({
      alunoId: '',
      productLines: [{ quantidade: 1, preco_unitario: 10 }],
      chargeLines: [{ kind: 'fee', amount: 20, note: 'Taxa' }],
      deferred: false,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('aluno_required');
  });

  it('bloqueia venda a prazo misturada com cobranças', () => {
    const r = validateMixedCart({
      alunoId: 'L1',
      productLines: [{ quantidade: 1, preco_unitario: 10 }],
      chargeLines: [{ kind: 'fee', amount: 5, note: 'Taxa' }],
      deferred: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('deferred_with_charges');
  });

  it('exige nota na taxa', () => {
    const r = validateMixedCart({
      alunoId: 'L1',
      productLines: [],
      chargeLines: [{ kind: 'fee', amount: 20, note: '' }],
      deferred: false,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('fee_note_required');
  });

  it('aloca pagamento único proporcionalmente', () => {
    const alloc = allocatePaymentsForMixedCheckout(
      [{ forma: 'cartao_credito', valor: 350, installments: 3, capture_method_id: 'cm1' }],
      { saleGross: 200, charges: [{ id: 'c1', amount: 150 }] }
    );
    expect(alloc.salePagamentos[0].valor).toBe(200);
    expect(alloc.salePagamentos[0].installments).toBe(3);
    expect(alloc.charges).toHaveLength(1);
    expect(alloc.charges[0].amount).toBe(150);
    expect(alloc.charges[0].method).toBe('cartao_credito');
    expect(alloc.charges[0].installments).toBe(3);
    expect(alloc.charges[0].capture_method_id).toBe('cm1');
  });

  it('buildSalePayloadFromMixed monta itens e pagamentos', () => {
    const payload = buildSalePayloadFromMixed({
      alunoId: 'L1',
      productLines: [
        {
          product_variant_id: 'v1',
          item_estoque_id: 'v1',
          quantidade: 1,
          preco_unitario: 200,
          line_kind: 'sale',
          expected_quantity: 3,
        },
      ],
      salePagamentos: [{ forma: 'pix', valor: 200 }],
      idempotency_key: 'k1',
      sale_source: 'pdv',
    });
    expect(payload.aluno_id).toBe('L1');
    expect(payload.itens).toHaveLength(1);
    expect(payload.pagamentos[0].valor).toBe(200);
    expect(payload.idempotency_key).toBe('k1');
  });

  it('buildStudentPaymentPayloadsFromMixed monta fee e plan', () => {
    const payloads = buildStudentPaymentPayloadsFromMixed({
      alunoId: 'L1',
      academyId: 'A1',
      userId: 'U1',
      chargeLines: [
        {
          id: 'c1',
          kind: 'fee',
          amount: 50,
          note: 'Taxa competição',
          plan_name: '',
        },
        {
          id: 'c2',
          kind: 'plan',
          amount: 150,
          note: '',
          plan_name: 'Adulto',
          reference_month: '2026-08',
        },
      ],
      chargeAllocations: [
        { id: 'c1', amount: 50, method: 'pix', installments: 1, account: 'Caixa' },
        {
          id: 'c2',
          amount: 150,
          method: 'cartao_credito',
          installments: 3,
          account: 'Caixa',
          capture_method_id: 'cm1',
        },
      ],
    });
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({
      payment_category: 'fee',
      amount: 50,
      note: 'Taxa competição',
      method: 'pix',
    });
    expect(payloads[1]).toMatchObject({
      payment_category: 'plan',
      reference_month: '2026-08',
      installments: 3,
      method: 'cartao_credito',
    });
  });

  it('summarizeMixedCheckout descreve totais', () => {
    const s = summarizeMixedCheckout({
      saleGross: 200,
      chargeLines: [
        { kind: 'plan', amount: 150 },
        { kind: 'fee', amount: 50 },
      ],
    });
    expect(s.total).toBe(400);
    expect(s.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'venda', amount: 200 }),
        expect.objectContaining({ label: 'mensalidade', amount: 150 }),
        expect.objectContaining({ label: 'taxa', amount: 50 }),
      ])
    );
  });
});
