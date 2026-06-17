import { describe, it, expect } from 'vitest';
import {
  buildForecastMensalidadePayments,
  buildPaymentsByLeadMonth,
  inForecastDateRange,
  mensalidadeForecastAmount,
} from '../lib/financeForecastInflows.js';

const financeConfig = {
  plans: [{ name: 'Mensal', price: 200 }],
};

describe('financeForecastInflows', () => {
  it('não projeta meses cobertos por plano anual pago', () => {
    const students = [{ $id: 'lead1', plan: 'Mensal', studentStatus: 'active' }];
    const gridPayments = [
      {
        $id: 'anchor',
        lead_id: 'lead1',
        reference_month: '2026-01',
        status: 'paid',
        payment_category: 'bundle',
        bundle_months: 12,
        bundle_origin_id: 'anchor',
      },
      {
        $id: 'covered',
        lead_id: 'lead1',
        reference_month: '2026-02',
        status: 'covered',
        payment_category: 'bundle',
        bundle_origin_id: 'anchor',
      },
    ];

    const rows = buildForecastMensalidadePayments({
      students,
      gridPayments,
      academyId: 'ac1',
      fromYmd: '2026-03-01',
      toYmd: '2026-05-31',
    });

    expect(rows.every((p) => p._projected)).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it('mantém projeção futura mesmo com outro mês pendente', () => {
    const students = [{ $id: 'lead1', plan: 'Mensal', studentStatus: 'active', due_day: 10 }];
    const gridPayments = [
      {
        $id: 'p-mar',
        lead_id: 'lead1',
        reference_month: '2026-03',
        status: 'pending',
        payment_category: 'plan',
        amount: 200,
      },
    ];

    const rows = buildForecastMensalidadePayments({
      students,
      gridPayments,
      academyId: 'ac1',
      fromYmd: '2026-03-01',
      toYmd: '2026-05-31',
    });

    const projected = rows.filter((p) => p._projected);
    expect(rows.some((p) => p.$id === 'p-mar')).toBe(true);
    expect(projected.some((p) => p.reference_month === '2026-04')).toBe(true);
    expect(projected.some((p) => p.reference_month === '2026-05')).toBe(true);
  });

  it('inclui pagamentos partial no conjunto de abertos', () => {
    const students = [{ $id: 'lead1', plan: 'Mensal', studentStatus: 'active' }];
    const gridPayments = [
      {
        $id: 'partial1',
        lead_id: 'lead1',
        reference_month: '2026-04',
        status: 'partial',
        payment_category: 'plan',
        amount: 300,
        paid_amount: 100,
        expected_amount: 300,
      },
    ];

    const rows = buildForecastMensalidadePayments({
      students,
      gridPayments,
      academyId: 'ac1',
      fromYmd: '2026-04-01',
      toYmd: '2026-04-30',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('partial');
  });

  it('mensalidadeForecastAmount desconta valor já recebido em partial', () => {
    const student = { plan: 'Mensal' };
    const payment = {
      status: 'partial',
      amount: 300,
      paid_amount: 100,
      expected_amount: 300,
    };
    expect(mensalidadeForecastAmount(student, payment, financeConfig)).toBe(200);
  });

  it('inForecastDateRange inclui vencidos dentro do período', () => {
    expect(inForecastDateRange('2026-03-05', '2026-03-01', '2026-03-31')).toBe(true);
    expect(inForecastDateRange('2026-02-28', '2026-03-01', '2026-03-31')).toBe(false);
  });

  it('buildPaymentsByLeadMonth indexa qualquer status', () => {
    const map = buildPaymentsByLeadMonth([
      { lead_id: 'a', reference_month: '2026-01', status: 'covered', payment_category: 'bundle' },
    ]);
    expect(map.has('a|2026-01')).toBe(true);
  });
});
