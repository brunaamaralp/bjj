import { describe, expect, it } from 'vitest';
import {
  computeServiceMonths,
  formatRescissionRequestDate,
  formatServiceMonthsLabel,
  mapLeadDocToContractVariables,
} from '../../lib/contracts/leadContractVariables.js';

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
