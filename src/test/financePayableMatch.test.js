import { describe, expect, it } from 'vitest';
import {
  amountsRoughlyMatch,
  labelsRoughlyMatch,
  findMatchingPendingPayable,
  formatPayableMatchDescription,
} from '../lib/financePayableMatch.js';
import { PAYABLE_SOURCE } from '../lib/payablesAggregate.js';

describe('financePayableMatch', () => {
  const pendingItem = {
    source: PAYABLE_SOURCE.LANCAMENTO,
    tx_id: 'tx-1',
    vendor_label: 'CPFL',
    amount: 450,
    category: 'Luz / energia',
    due_date: '2026-07-10',
    status: 'due_soon',
  };

  it('amountsRoughlyMatch tolera até 5%', () => {
    expect(amountsRoughlyMatch(450, 450)).toBe(true);
    expect(amountsRoughlyMatch(450, 460)).toBe(true);
    expect(amountsRoughlyMatch(450, 500)).toBe(false);
  });

  it('labelsRoughlyMatch compara fornecedor normalizado', () => {
    expect(labelsRoughlyMatch('CPFL', 'cpfl')).toBe(true);
    expect(labelsRoughlyMatch('Conta CPFL', 'CPFL')).toBe(true);
    expect(labelsRoughlyMatch('Sabesp', 'CPFL')).toBe(false);
  });

  it('findMatchingPendingPayable encontra conta pendente compatível', () => {
    const match = findMatchingPendingPayable([pendingItem], {
      planName: 'CPFL',
      gross: 450,
      category: 'Luz / energia',
    });
    expect(match?.tx_id).toBe('tx-1');
  });

  it('ignora templates e projeções', () => {
    const match = findMatchingPendingPayable(
      [
        { ...pendingItem, source: PAYABLE_SOURCE.TEMPLATE, tx_id: undefined, template_id: 'tpl-1' },
      ],
      { planName: 'CPFL', gross: 450 }
    );
    expect(match).toBeNull();
  });

  it('rejeita quando categoria difere', () => {
    const match = findMatchingPendingPayable([pendingItem], {
      planName: 'CPFL',
      gross: 450,
      category: 'Água',
    });
    expect(match).toBeNull();
  });

  it('formatPayableMatchDescription monta texto amigável', () => {
    const text = formatPayableMatchDescription(pendingItem);
    expect(text).toContain('CPFL');
    expect(text).toContain('10/07/2026');
  });
});
