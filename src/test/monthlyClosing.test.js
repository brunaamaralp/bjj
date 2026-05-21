import { describe, it, expect } from 'vitest';
import {
  buildClosingRows,
  filterClosingRows,
  computeClosingTotals,
  exportClosingCsv,
  dateInReferenceMonth,
  studentDisplayNames,
  formatPaymentMethod,
} from '../lib/monthlyClosing.js';

describe('monthlyClosing', () => {
  const financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };
  const student = { id: 's1', name: 'Ana', type: 'Criança', parentName: 'Maria' };

  it('dateInReferenceMonth', () => {
    expect(dateInReferenceMonth('2026-05-15T10:00:00Z', '2026-05')).toBe(true);
    expect(dateInReferenceMonth('2026-04-30T10:00:00Z', '2026-05')).toBe(false);
  });

  it('studentDisplayNames includes guardian for child', () => {
    expect(studentDisplayNames(student)).toEqual({ name: 'Ana', guardian: 'Maria' });
  });

  it('buildClosingRows from payment without duplicating linked tx', () => {
    const payments = [
      {
        $id: 'p1',
        lead_id: 's1',
        status: 'paid',
        reference_month: '2026-05',
        expected_amount: 200,
        paid_amount: 200,
        paid_at: '2026-05-10T12:00:00Z',
        plan_name: 'Mensal',
        method: 'pix',
        account: 'Sicoob',
        financial_tx_id: 'tx1',
      },
    ];
    const transactions = [
      {
        id: 'tx1',
        type: 'plan',
        gross: 200,
        net: 200,
        status: 'settled',
        settledAt: '2026-05-10T12:00:00Z',
        lead_id: 's1',
        method: 'pix',
        installments: 1,
        planName: 'Mensal',
        saleId: '',
        createdAt: '2026-05-10T12:00:00Z',
      },
    ];
    const leadById = new Map([[student.id, student]]);
    const { rows } = buildClosingRows({
      payments,
      transactions,
      leadById,
      financeConfig,
      referenceMonth: '2026-05',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe('mensalidade');
    expect(rows[0].received).toBe(200);
    expect(formatPaymentMethod('pix', 'Sicoob')).toBe('PIX — Sicoob');
  });

  it('includes product transaction', () => {
    const { rows } = buildClosingRows({
      payments: [],
      transactions: [
        {
          id: 'tx2',
          type: 'product',
          gross: 150,
          net: 150,
          status: 'settled',
          settledAt: '2026-05-12T12:00:00Z',
          planName: 'Item x2',
          method: 'pix',
          installments: 1,
          saleId: 'sale1',
          createdAt: '2026-05-12T12:00:00Z',
        },
      ],
      leadById: new Map(),
      financeConfig,
      referenceMonth: '2026-05',
    });
    expect(rows[0].origin).toBe('produto');
    expect(rows[0].situation).toBe('recebido');
  });

  it('computeClosingTotals and export CSV', () => {
    const rows = [
      {
        expected: 200,
        received: 200,
        pending: 0,
        paymentMethod: 'PIX',
        name: 'Ana',
        guardian: '',
        description: 'Mensal',
        date: '2026-05-10T12:00:00Z',
        situation: 'recebido',
        origin: 'mensalidade',
      },
    ];
    const totals = computeClosingTotals(rows);
    expect(totals.received).toBe(200);
    const { body, fileName } = exportClosingCsv(rows, { academyName: 'Academia Teste', referenceMonth: '2026-05' });
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain(';');
    expect(fileName).toBe('fechamento_academia-teste_2026-05.csv');
  });

  it('excludes paid mensalidade when reference_month differs', () => {
    const { rows } = buildClosingRows({
      payments: [
        {
          $id: 'p2',
          lead_id: 's1',
          status: 'paid',
          reference_month: '2026-04',
          paid_amount: 200,
          expected_amount: 200,
          paid_at: '2026-05-10T12:00:00Z',
        },
      ],
      transactions: [],
      leadById: new Map([[student.id, student]]),
      financeConfig,
      referenceMonth: '2026-05',
    });
    expect(rows).toHaveLength(0);
  });

  it('includes product refund as negative received', () => {
    const { rows } = buildClosingRows({
      payments: [],
      transactions: [
        {
          id: 'txp',
          type: 'product',
          gross: 100,
          net: 100,
          status: 'cancelled',
          settledAt: '2026-05-12T12:00:00Z',
          saleId: 'sale1',
          createdAt: '2026-05-12T12:00:00Z',
        },
        {
          id: 'txr',
          type: 'refund',
          gross: 100,
          net: -100,
          status: 'settled',
          settledAt: '2026-05-13T12:00:00Z',
          planName: 'Estorno venda #SALE1',
          saleId: 'sale1',
          createdAt: '2026-05-13T12:00:00Z',
        },
      ],
      leadById: new Map(),
      financeConfig,
      referenceMonth: '2026-05',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe('produto');
    expect(rows[0].received).toBe(-100);
  });

  it('filterClosingRows by origin', () => {
    const rows = [
      { origin: 'mensalidade', situation: 'recebido', paymentMethodKey: 'pix|' },
      { origin: 'produto', situation: 'recebido', paymentMethodKey: 'pix|' },
    ];
    const filtered = filterClosingRows(rows, {
      origins: new Set(['produto']),
      situations: new Set(['recebido', 'parcial', 'pendente']),
      paymentMethodKey: 'all',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].origin).toBe('produto');
  });
});
