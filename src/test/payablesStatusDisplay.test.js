import { describe, expect, it } from 'vitest';
import {
  payableStatusLabel,
  payableStatusBadgeClass,
  payableDueRelativeHint,
  payableMatchesStatusFilter,
} from '../lib/payablesStatusDisplay.js';

describe('payablesStatusDisplay', () => {
  it('labels status', () => {
    expect(payableStatusLabel('overdue')).toBe('Vencida');
    expect(payableStatusLabel('due_today')).toBe('Vence hoje');
    expect(payableStatusLabel('due_soon')).toBe('Vence em breve');
    expect(payableStatusLabel('open')).toBe('A vencer');
  });

  it('badge classes', () => {
    expect(payableStatusBadgeClass('overdue')).toBe('finance-badge-atraso');
    expect(payableStatusBadgeClass('due_today')).toBe('finance-badge-aguardando');
    expect(payableStatusBadgeClass('due_soon')).toBe('finance-badge-aguardando');
    expect(payableStatusBadgeClass('open')).toBe('finance-badge-pendente');
  });

  it('relative hints', () => {
    expect(payableDueRelativeHint('2026-06-14', '2026-06-16')).toBe('há 2 dias');
    expect(payableDueRelativeHint('2026-06-15', '2026-06-16')).toBe('há 1 dia');
    expect(payableDueRelativeHint('2026-06-16', '2026-06-16')).toBe('hoje');
    expect(payableDueRelativeHint('2026-06-17', '2026-06-16')).toBe('em 1 dia');
    expect(payableDueRelativeHint('2026-06-20', '2026-06-16')).toBe('em 4 dias');
  });

  it('matches status filter chips', () => {
    expect(payableMatchesStatusFilter({ status: 'due_today' }, 'week')).toBe(true);
    expect(payableMatchesStatusFilter({ status: 'due_soon' }, 'week')).toBe(true);
    expect(payableMatchesStatusFilter({ status: 'open' }, 'week')).toBe(false);
    expect(payableMatchesStatusFilter({ status: 'open' }, 'open')).toBe(true);
    expect(payableMatchesStatusFilter({ status: 'overdue' }, 'overdue')).toBe(true);
    expect(payableMatchesStatusFilter({ status: 'overdue' }, 'all')).toBe(true);
  });
});
