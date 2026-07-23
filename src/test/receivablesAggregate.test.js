import { describe, it, expect } from 'vitest';
import {
  openMensalidadeAmount,
  buildMensalidadeReceivableItems,
  buildPendingTxReceivableItems,
  buildDeferredSaleReceivableItems,
  summarizeReceivables,
  buildReceivablesSnapshot,
  preferSettledPayment,
  indexPaymentsByLeadPreferSettled,
  RECEIVABLE_SOURCE,
} from '../lib/receivablesAggregate.js';

const financeConfig = {
  plans: [{ name: 'Plano Básico', price: 200 }],
};

describe('receivablesAggregate', () => {
  it('openMensalidadeAmount — esperado menos recebido', () => {
    const student = { id: 's1', plan: 'Plano Básico', student_status: 'active' };
    expect(
      openMensalidadeAmount(student, { status: 'partial', paid_amount: 50, expected_amount: 200 }, financeConfig)
    ).toBe(150);
    expect(openMensalidadeAmount(student, { status: 'paid', paid_amount: 200 }, financeConfig)).toBe(0);
    expect(openMensalidadeAmount(student, { status: 'pending' }, financeConfig)).toBe(200);
  });

  it('buildMensalidadeReceivableItems — ignora pagos e trancados', () => {
    const students = [
      { id: 'a', name: 'Ana', plan: 'Plano Básico', status: 'Matriculado', student_status: 'active' },
      { id: 'b', name: 'Beto', plan: 'Plano Básico', status: 'Matriculado', student_status: 'active', freeze_status: 'active' },
    ];
    const payments = [
      { lead_id: 'a', status: 'pending', expected_amount: 200 },
      { lead_id: 'b', status: 'pending', expected_amount: 200 },
    ];
    const items = buildMensalidadeReceivableItems({
      students,
      payments,
      financeConfig,
      referenceMonth: '2026-06',
      today: new Date('2026-06-15T12:00:00'),
    });
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Ana');
    expect(items[0].source).toBe(RECEIVABLE_SOURCE.MENSALIDADE);
  });

  it('buildMensalidadeReceivableItems — mês coberto por pacote anual pago não entra a receber', () => {
    const students = [
      { id: 'a', name: 'Ana', plan: 'Plano Anual', status: 'Matriculado', student_status: 'active' },
    ];
    // Âncora em outro mês; mês de referência sem doc (ou pending residual)
    const coveragePayments = [
      {
        $id: 'anc-1',
        lead_id: 'a',
        payment_category: 'bundle',
        bundle_origin_id: 'anc-1',
        bundle_months: 12,
        reference_month: '2026-01',
        status: 'paid',
        amount: 2400,
      },
    ];
    const items = buildMensalidadeReceivableItems({
      students,
      payments: [{ lead_id: 'a', status: 'pending', expected_amount: 200, reference_month: '2026-06' }],
      coveragePayments,
      financeConfig,
      referenceMonth: '2026-06',
      today: new Date('2026-06-15T12:00:00'),
    });
    expect(items).toHaveLength(0);
  });

  it('buildMensalidadeReceivableItems — cobertura histórica (âncora covered) também exclui', () => {
    const students = [
      { id: 'a', name: 'Ana', plan: 'Plano Anual', status: 'Matriculado', student_status: 'active' },
    ];
    const coveragePayments = [
      {
        $id: 'anc-h',
        lead_id: 'a',
        payment_category: 'bundle',
        bundle_origin_id: 'anc-h',
        bundle_months: 12,
        reference_month: '2026-01',
        status: 'covered',
        covered_reason: 'historical',
        amount: 0,
      },
    ];
    const items = buildMensalidadeReceivableItems({
      students,
      payments: [],
      coveragePayments,
      financeConfig,
      referenceMonth: '2026-07',
      today: new Date('2026-07-15T12:00:00'),
    });
    expect(items).toHaveLength(0);
  });

  it('buildMensalidadeReceivableItems — prefer covered quando há pending duplicado no mês', () => {
    const students = [
      { id: 'a', name: 'Ana', plan: 'Plano Anual', status: 'Matriculado', student_status: 'active' },
    ];
    const items = buildMensalidadeReceivableItems({
      students,
      payments: [
        { lead_id: 'a', status: 'pending', expected_amount: 200, reference_month: '2026-07' },
        {
          $id: 'cov',
          lead_id: 'a',
          status: 'covered',
          payment_category: 'bundle',
          reference_month: '2026-07',
          amount: 0,
        },
      ],
      financeConfig,
      referenceMonth: '2026-07',
      today: new Date('2026-07-15T12:00:00'),
    });
    expect(items).toHaveLength(0);
  });

  it('preferSettledPayment / indexPaymentsByLeadPreferSettled', () => {
    const map = indexPaymentsByLeadPreferSettled([
      { lead_id: 'a', status: 'pending', expected_amount: 200 },
      { lead_id: 'a', status: 'covered', amount: 0 },
    ]);
    expect(map.a.status).toBe('covered');
    expect(preferSettledPayment({ status: 'pending' }, { status: 'paid' }).status).toBe('paid');
  });

  it('buildPendingTxReceivableItems — só entradas pendentes', () => {
    const items = buildPendingTxReceivableItems([
      { id: '1', status: 'pending', type: 'plan', gross: 100 },
      { id: '2', status: 'pending', type: 'expense', gross: 50, direction: 'out' },
      { id: '3', status: 'settled', type: 'plan', gross: 80 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(100);
    expect(items[0].source).toBe(RECEIVABLE_SOURCE.LANCAMENTO);
  });

  it('buildDeferredSaleReceivableItems', () => {
    const items = buildDeferredSaleReceivableItems([
      { $id: 'v1', status: 'pendente', total: 120, deferred: true, cliente_nome: 'Cliente X' },
      { $id: 'v2', status: 'concluida', total: 90 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Cliente X');
    expect(items[0].amount).toBe(120);
  });

  it('summarizeReceivables e buildReceivablesSnapshot', () => {
    const snapshot = buildReceivablesSnapshot({
      students: [{ id: 'a', name: 'Ana', plan: 'Plano Básico', status: 'Matriculado', student_status: 'active' }],
      payments: [{ lead_id: 'a', status: 'pending', expected_amount: 200 }],
      financeConfig,
      referenceMonth: '2026-06',
      pendingTransactions: [{ id: 'tx1', status: 'pending', type: 'other', gross: 30 }],
      deferredSales: [{ $id: 's1', status: 'pendente', total: 70, deferred: true }],
      today: new Date('2026-06-10T12:00:00'),
    });
    expect(snapshot.summary.total).toBe(300);
    expect(snapshot.summary.bySource.mensalidade).toBe(200);
    expect(snapshot.summary.bySource.lancamento).toBe(30);
    expect(snapshot.summary.bySource.venda).toBe(70);
    expect(snapshot.items.length).toBe(3);

    const empty = summarizeReceivables([]);
    expect(empty.total).toBe(0);
    expect(empty.count).toBe(0);
  });
});
