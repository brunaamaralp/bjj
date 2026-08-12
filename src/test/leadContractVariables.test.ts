import { describe, expect, it } from 'vitest';
import {
  computeServiceMonths,
  formatContractMoney,
  formatRescissionRequestDate,
  formatServiceMonthsLabel,
  mapLeadDocToContractVariables,
  resolveContractPaidAmount,
} from '../../lib/contracts/leadContractVariables.js';
import { mergeContractTemplateHtml } from '../../lib/contracts/contractVariables.js';

describe('leadContractVariables rescission', () => {
  it('formats rescission request date as dd / mm / yyyy', () => {
    expect(formatRescissionRequestDate('2026-05-29')).toBe('29 / 05 / 2026');
  });

  it('computes service months from enrollment to exit date', () => {
    expect(computeServiceMonths('2024-03-15', '2024-05-29')).toBe(3);
    expect(computeServiceMonths('2024-03-15', '2024-03-20')).toBe(1);
    expect(computeServiceMonths('2024-03-15', '2024-02-01')).toBe(0);
  });

  it('formats service months label with plural', () => {
    expect(formatServiceMonthsLabel(1)).toBe('1 mês');
    expect(formatServiceMonthsLabel(3)).toBe('3 meses');
  });

  it('maps exit_date to data_solicitacao_rescisao and meses_servico_utilizados', () => {
    const vars = mapLeadDocToContractVariables(
      {
        name: 'João',
        enrollment_date: '2024-01-10',
        exit_date: '2024-04-15',
      },
      'Academia Teste'
    );
    expect(vars.data_solicitacao_rescisao).toBe('15 / 04 / 2024');
    expect(vars.meses_servico_utilizados).toBe('4 meses');
  });
});

describe('leadContractVariables valor_pago', () => {
  it('formats money as BRL', () => {
    expect(formatContractMoney(330)).toBe('R$\u00a0330,00');
  });

  it('uses student plan_price snapshot when present', () => {
    expect(
      resolveContractPaidAmount({
        plan: 'Mensal Adulto',
        plan_price: 330,
      })
    ).toBe('R$\u00a0330,00');
  });

  it('applies fixed discount to snapshot price', () => {
    expect(
      resolveContractPaidAmount({
        plan: 'Mensal',
        planPrice: 300,
        discount_type: 'fixed',
        discount_amount: 50,
      })
    ).toBe('R$\u00a0250,00');
  });

  it('falls back to finance catalog price when snapshot is missing', () => {
    expect(
      resolveContractPaidAmount(
        { plan: 'Mensal Adulto' },
        { plans: [{ name: 'Mensal Adulto', price: 330 }] }
      )
    ).toBe('R$\u00a0330,00');
  });

  it('maps valor_pago into contract variables and merge replaces token', () => {
    const vars = mapLeadDocToContractVariables(
      { name: 'Maria', plan: 'Mensal', plan_price: 330 },
      'Academia',
      { plans: [{ name: 'Mensal', price: 400 }] }
    );
    expect(vars.valor_pago).toBe('R$\u00a0330,00');
    expect(mergeContractTemplateHtml('<p>Total: {{valor_pago}}</p>', vars)).toBe(
      '<p>Total: R$\u00a0330,00</p>'
    );
  });

  it('leaves valor_pago empty when there is no plan or price', () => {
    const vars = mapLeadDocToContractVariables({ name: 'Sem plano' }, 'Academia');
    expect(vars.valor_pago).toBe('');
  });
});
