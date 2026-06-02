import { describe, it, expect } from 'vitest';
import {
  isOpenOverduePayment,
  hasOpenOverduePayments,
  studentDocIsMarkedOverdue,
  resolveOverdueLabelFromFinanceConfig,
} from '../../lib/server/studentOverdueSync.js';
import { readStudentOverdueFlag, resolveStudentOverdueBadgeLabel } from '../lib/studentOverdueDisplay.js';

describe('studentOverdueSync', () => {
  it('isOpenOverduePayment detects pending with past due_date', () => {
    expect(
      isOpenOverduePayment({ status: 'pending', due_date: '2020-01-15' }, '2026-06-02')
    ).toBe(true);
  });

  it('isOpenOverduePayment ignores paid', () => {
    expect(
      isOpenOverduePayment({ status: 'paid', due_date: '2020-01-15' }, '2026-06-02')
    ).toBe(false);
  });

  it('isOpenOverduePayment ignores missing due_date', () => {
    expect(isOpenOverduePayment({ status: 'pending' }, '2026-06-02')).toBe(false);
  });

  it('hasOpenOverduePayments aggregates list', () => {
    const list = [
      { status: 'paid', due_date: '2020-01-01' },
      { status: 'partial', due_date: '2025-12-01' },
    ];
    expect(hasOpenOverduePayments(list, '2026-06-02')).toBe(true);
  });

  it('resolveOverdueLabelFromFinanceConfig uses financeConfig', () => {
    expect(resolveOverdueLabelFromFinanceConfig({ overdueLabel: 'Devedor' })).toBe('Devedor');
  });

  it('studentDocIsMarkedOverdue', () => {
    expect(studentDocIsMarkedOverdue({ overdue: true })).toBe(true);
    expect(studentDocIsMarkedOverdue({ overdue: false })).toBe(false);
  });
});

describe('studentOverdueDisplay', () => {
  it('resolveStudentOverdueBadgeLabel prefers student doc label', () => {
    expect(
      resolveStudentOverdueBadgeLabel(
        { overdue: true, overdueLabel: 'Atrasado' },
        { overdueLabel: 'Inadimplente' }
      )
    ).toBe('Atrasado');
  });

  it('readStudentOverdueFlag', () => {
    expect(readStudentOverdueFlag({ overdue: true })).toBe(true);
  });
});
