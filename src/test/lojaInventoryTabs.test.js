import { describe, expect, it } from 'vitest';
import {
  lojaEstoqueTabParams,
  resolveInventorySubtab,
} from '../lib/lojaInventoryTabs';

describe('lojaInventoryTabs', () => {
  it('resolveInventorySubtab defaults to saldo', () => {
    expect(resolveInventorySubtab(new URLSearchParams('tab=estoque'))).toBe('saldo');
  });

  it('resolveInventorySubtab reads subtab', () => {
    expect(resolveInventorySubtab(new URLSearchParams('tab=estoque&subtab=movimentos'))).toBe(
      'movimentos'
    );
  });

  it('lojaEstoqueTabParams keeps hub tab', () => {
    const next = lojaEstoqueTabParams('movimentos', new URLSearchParams('tab=estoque&subtab=saldo'));
    expect(next.get('tab')).toBe('estoque');
    expect(next.get('subtab')).toBe('movimentos');
  });
});
