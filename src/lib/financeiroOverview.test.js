import { describe, expect, it } from 'vitest';
import {
  monthEndYmd,
  formatBalanceDelta,
  computeMensalidadesMonthKpis,
} from './financeiroOverview.js';

describe('monthEndYmd', () => {
  it('returns last day of month', () => {
    expect(monthEndYmd('2026-02')).toBe('2026-02-28');
    expect(monthEndYmd('2024-02')).toBe('2024-02-29');
    expect(monthEndYmd('2026-06')).toBe('2026-06-30');
  });
});

describe('formatBalanceDelta', () => {
  it('computes pct change for bank total comparison', () => {
    expect(formatBalanceDelta(1100, 1000)).toEqual({ type: 'pct', pct: 10 });
    expect(formatBalanceDelta(900, 1000)).toEqual({ type: 'pct', pct: -10 });
  });
});

describe('computeMensalidadesMonthKpis', () => {
  const financeConfig = { plans: [{ name: 'Plano', price: 200 }] };

  it('não conta esperado/atraso quando mês está coberto por pacote pago', () => {
    const students = [
      { id: 'a', plan: 'Plano', student_status: 'active', dueDay: 5 },
    ];
    const payments = [];
    const coveragePayments = [
      {
        $id: 'anc',
        lead_id: 'a',
        payment_category: 'bundle',
        bundle_origin_id: 'anc',
        bundle_months: 12,
        reference_month: '2026-01',
        status: 'paid',
        amount: 2400,
      },
    ];
    const kpis = computeMensalidadesMonthKpis(
      students,
      payments,
      financeConfig,
      '2026-06',
      { coveragePayments }
    );
    expect(kpis.expectedTotal).toBe(0);
    expect(kpis.overdueCount).toBe(0);
    expect(kpis.overdueOpen).toBe(0);
  });
});
