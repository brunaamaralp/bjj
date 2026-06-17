import { describe, it, expect } from 'vitest';
import {
  computeAcquirerFee,
  defaultAcquirerFees,
  enrichInstallmentScheduleWithAcquirerFees,
  forecastInflowAmountsFromFees,
  hasAcquirerFeesConfigured,
  computeAnticipationFee,
  mirrorAmountsForPayment,
  normalizeAcquirerFees,
  resolveMdrGross,
} from '../lib/acquirerFees.js';
import { forecastInflowAmounts } from '../lib/resolveAcquirerFees.js';
import { pushForecastItem, finalizeWeeks, sumForecastFlows } from '../lib/financeForecastCore.js';
import { mensalidadeForecastNetAmount } from '../lib/financeForecastInflows.js';
import { canRegisterAnticipation } from '../lib/financeAnticipation.js';
import { anticipationEligibilityError } from '../../lib/server/financeAnticipationHandler.js';

const financeConfigWithMdr = {
  acquirerFees: {
    pix: { percent: 0, fixed: 0 },
    debito: { percent: 0, fixed: 0 },
    credito_avista: { percent: 3, fixed: 0 },
    credito_parcelado: { '2': 4, '3': 4, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0 },
  },
  plans: [{ name: 'Mensal', price: 200 }],
};

describe('acquirerFees', () => {
  it('defaultAcquirerFees zera todas as faixas', () => {
    const fees = defaultAcquirerFees();
    expect(fees.pix.percent).toBe(0);
    expect(fees.credito_parcelado['12']).toBe(0);
    expect(hasAcquirerFeesConfigured(fees)).toBe(false);
  });

  it('computeAcquirerFee aplica MDR sobre gross', () => {
    const { gross, fee, net } = computeAcquirerFee({
      gross: 208,
      method: 'cartao_credito',
      installments: 1,
      acquirerFees: financeConfigWithMdr.acquirerFees,
    });
    expect(gross).toBe(208);
    expect(fee).toBe(6.24);
    expect(net).toBe(201.76);
  });

  it('mirrorAmountsForPayment não inclui repasse no fee', () => {
    const mirror = mirrorAmountsForPayment({
      gross: 208,
      method: 'cartao_credito',
      installments: 1,
      acquirerFees: financeConfigWithMdr.acquirerFees,
    });
    expect(mirror.fee).toBe(6.24);
    expect(mirror.net).toBe(201.76);
  });

  it('forecastInflowAmounts retorna bruto=líquido sem MDR configurado', () => {
    const amounts = forecastInflowAmounts(200, 'pix', 1, { acquirerFees: defaultAcquirerFees() });
    expect(amounts).toEqual({ amount: 200, amount_gross: 200 });
  });

  it('forecastInflowAmounts separa bruto e líquido com MDR', () => {
    const amounts = forecastInflowAmounts(200, 'cartao_credito', 1, financeConfigWithMdr);
    expect(amounts.amount_gross).toBe(200);
    expect(amounts.amount).toBe(194);
    expect(amounts.acquirer_fee).toBe(6);
  });

  it('enrichInstallmentScheduleWithAcquirerFees adiciona gross/fee/net', () => {
    const rows = enrichInstallmentScheduleWithAcquirerFees(
      [{ installment_number: 1, due_date: '2026-04-10', amount: 100 }],
      'cartao_credito',
      1,
      financeConfigWithMdr.acquirerFees
    );
    expect(rows[0].gross).toBe(100);
    expect(rows[0].fee).toBe(3);
    expect(rows[0].net).toBe(97);
  });

  it('mensalidadeForecastNetAmount usa método do pagamento', () => {
    const student = { plan: 'Mensal' };
    const payment = { status: 'pending', amount: 200, method: 'cartao_credito', installments: 1 };
    const amounts = mensalidadeForecastNetAmount(student, payment, financeConfigWithMdr);
    expect(amounts.amount_gross).toBe(200);
    expect(amounts.amount).toBe(194);
  });

  it('pushForecastItem acumula inflow bruto e líquido', () => {
    const weeks = [
      {
        week_start: '2026-05-12',
        week_end: '2026-05-18',
        expected_inflow: 0,
        expected_inflow_gross: 0,
        expected_outflow: 0,
        net: 0,
        items: [],
      },
    ];
    pushForecastItem(weeks, {
      type: 'mensalidade',
      amount: 194,
      amount_gross: 200,
      due_date: '2026-05-15',
      _flow: 'in',
    });
    finalizeWeeks(weeks);
    const totals = sumForecastFlows(weeks);
    expect(totals.inflow).toBe(194);
    expect(totals.inflow_gross).toBe(200);
  });

  it('normalizeAcquirerFees preserva parcelado', () => {
    const normalized = normalizeAcquirerFees({ credito_parcelado: { '3': 2.5 } });
    expect(normalized.credito_parcelado['3']).toBe(2.5);
    expect(hasAcquirerFeesConfigured(normalized)).toBe(true);
  });

  it('pass_through calcula MDR sobre base do plano', () => {
    const { fee, net } = mirrorAmountsForPayment({
      gross: 208,
      planBase: 200,
      policy: 'pass_through',
      method: 'cartao_credito',
      installments: 1,
      acquirerFees: financeConfigWithMdr.acquirerFees,
    });
    expect(fee).toBe(6);
    expect(net).toBe(202);
    expect(resolveMdrGross({ gross: 208, planBase: 200, policy: 'pass_through' })).toBe(200);
  });

  it('computeAnticipationFee usa percentual configurado', () => {
    const fee = computeAnticipationFee(194, {
      ...financeConfigWithMdr.acquirerFees,
      antecipacao: { percent: 2, fixed: 0 },
    });
    expect(fee).toBe(3.88);
  });

  it('canRegisterAnticipation aceita entrada liquidada em cartão', () => {
    expect(
      canRegisterAnticipation({
        id: 't1',
        status: 'settled',
        method: 'cartao_credito',
        gross: 200,
        net: 194,
        fee: 6,
      })
    ).toBe(true);
  });

  it('anticipationEligibilityError bloqueia se já antecipado', () => {
    const err = anticipationEligibilityError(
      {
        status: 'settled',
        gross: 200,
        net: 194,
        method: 'pix',
        type: 'plan',
      },
      { hasChild: true }
    );
    expect(err).toBe('already_anticipated');
  });
});
