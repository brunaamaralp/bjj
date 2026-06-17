import { describe, it, expect } from 'vitest';
import {
  buildEqualInstallmentSchedule,
  buildForecastInstallmentItems,
  parseInstallmentScheduleJson,
  resolvePaymentInstallmentSchedule,
  resolveSaleInstallmentSchedule,
} from '../lib/installmentSchedule.js';
import { buildContractForecastItems, estimateContractFirstPaymentYmd } from '../lib/financeForecastContracts.js';

const financeConfig = {
  plans: [{ name: 'Mensal', price: 250 }],
};

describe('installmentSchedule', () => {
  it('divide valor em parcelas mensais iguais', () => {
    const rows = buildEqualInstallmentSchedule(300, 3, '2026-04-10');
    expect(rows).toHaveLength(3);
    expect(rows[0].amount).toBe(100);
    expect(rows[1].due_date).toBe('2026-05-10');
    expect(rows[2].amount).toBe(100);
  });

  it('usa JSON explícito quando presente', () => {
    const json = JSON.stringify([
      { installment_number: 1, due_date: '2026-04-10', amount: 150, status: 'pending' },
      { installment_number: 2, due_date: '2026-05-10', amount: 150, status: 'received' },
    ]);
    const rows = resolvePaymentInstallmentSchedule(
      { installment_schedule_json: json, installments: 2, status: 'pending' },
      { plan: 'Mensal' },
      financeConfig
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(150);
  });

  it('deriva parcelas de mensalidade pending com installments > 1', () => {
    const rows = resolvePaymentInstallmentSchedule(
      {
        status: 'pending',
        installments: 3,
        reference_month: '2026-04',
        amount: 300,
        due_date: '2026-04-10',
      },
      { plan: 'Mensal', due_day: 10 },
      financeConfig
    );
    expect(rows).toHaveLength(3);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(300);
  });

  it('projeta parcelas de venda deferred', () => {
    const rows = resolveSaleInstallmentSchedule({
      deferred: true,
      status: 'pendente',
      installments: 2,
      total: 400,
      due_date: '2026-05-01',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].amount).toBe(200);
  });

  it('buildForecastInstallmentItems respeita intervalo', () => {
    const items = buildForecastInstallmentItems({
      payments: [
        {
          $id: 'p1',
          lead_id: 'lead1',
          status: 'pending',
          installments: 2,
          amount: 200,
          due_date: '2026-04-15',
          plan_name: 'Mensal',
        },
      ],
      sales: [],
      studentsByLead: new Map([['lead1', { plan: 'Mensal', name: 'Ana' }]]),
      financeConfig,
      fromYmd: '2026-04-01',
      toYmd: '2026-04-30',
      studentNames: new Map([['lead1', 'Ana']]),
    });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('parcela');
  });
});

describe('financeForecastContracts', () => {
  it('estima 1ª mensalidade após expiração do contrato', () => {
    expect(estimateContractFirstPaymentYmd({ expiresAt: '2026-04-20' }, '2026-04-01')).toBe(
      '2026-04-21'
    );
  });

  it('inclui contrato aguardando com valor do plano', () => {
    const items = buildContractForecastItems(
      [{ $id: 'c1', leadId: 'lead1', name: 'Contrato João', expiresAt: '2026-04-15' }],
      {
        studentsByLead: new Map([['lead1', { plan: 'Mensal', name: 'João' }]]),
        financeConfig,
        fromYmd: '2026-04-01',
        toYmd: '2026-05-31',
        todayYmd: '2026-04-01',
      }
    );
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(250);
    expect(items[0].type).toBe('contrato');
  });
});
