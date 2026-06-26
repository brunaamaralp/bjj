import { describe, it, expect } from 'vitest';
import {
  resolveMirrorFinanceCategory,
  isReconcilableMirrorPayment,
} from '../lib/studentPaymentMirrorCategory.js';
import { FINANCE_CATEGORIES } from '../lib/financeCategories.js';

describe('studentPaymentMirrorCategory', () => {
  it('maps plan to mensalidade', () => {
    const cat = resolveMirrorFinanceCategory('plan');
    expect(cat).toBe(FINANCE_CATEGORIES.MENSALIDADE);
  });

  it('maps fee and other to outras receitas', () => {
    expect(resolveMirrorFinanceCategory('fee')).toBe(FINANCE_CATEGORIES.OUTROS_RECEITA);
    expect(resolveMirrorFinanceCategory('other')).toBe(FINANCE_CATEGORIES.OUTROS_RECEITA);
  });

  it('isReconcilableMirrorPayment includes fee/other and excludes unknown', () => {
    expect(isReconcilableMirrorPayment({ payment_category: 'fee' })).toBe(true);
    expect(isReconcilableMirrorPayment({ payment_category: 'other' })).toBe(true);
    expect(isReconcilableMirrorPayment({ payment_category: 'plan' })).toBe(true);
    expect(isReconcilableMirrorPayment({})).toBe(true);
  });
});
