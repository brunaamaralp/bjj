import { describe, expect, it } from 'vitest';
import {
  assignBankAccountEligibilityError,
  buildAssignBankAccountPatch,
  canAssignBankAccountRole,
  currentBankAccountLabel,
} from '../../lib/server/financeTxAssignBankAccount.js';

describe('financeTxAssignBankAccount', () => {
  it('assignBankAccountEligibilityError exige liquidado', () => {
    expect(assignBankAccountEligibilityError({ status: 'settled' })).toBe('');
    expect(assignBankAccountEligibilityError({ status: 'pending' })).toBe('only_settled_can_assign_bank');
    expect(assignBankAccountEligibilityError({ status: 'cancelled' })).toBe('already_cancelled');
  });

  it('canAssignBankAccountRole — despesa só gestor', () => {
    expect(canAssignBankAccountRole({ status: 'settled', type: 'plan' }, false)).toBe(true);
    expect(canAssignBankAccountRole({ status: 'settled', type: 'expense_operational' }, false)).toBe(false);
    expect(canAssignBankAccountRole({ status: 'settled', direction: 'out', type: 'other' }, false)).toBe(false);
    expect(canAssignBankAccountRole({ status: 'settled', type: 'expense_operational' }, true)).toBe(true);
  });

  it('buildAssignBankAccountPatch grava bank_account e normaliza @bank: na note', () => {
    const doc = {
      status: 'settled',
      type: 'plan',
      category: 'Mensalidades',
      note: '@bank:Legado\nPagamento aluno',
    };
    const patch = buildAssignBankAccountPatch(doc, 'Sicoob · 1234');
    expect(patch.bank_account).toBe('Sicoob · 1234');
    expect(patch.note).toContain('@bank:Sicoob · 1234');
    expect(currentBankAccountLabel({ ...doc, ...patch })).toBe('Sicoob · 1234');
  });
});
