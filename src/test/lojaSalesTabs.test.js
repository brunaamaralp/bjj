import { describe, expect, it } from 'vitest';
import {
  isLegacySalesLeafTab,
  lojaVendasTabParams,
  lojaVendasPdvParams,
  resolveSalesSubtab,
  resolveSalesPdvMode,
  salesSubtabNeedsNormalize,
} from '../lib/lojaSalesTabs';

describe('lojaSalesTabs', () => {
  it('resolveSalesSubtab defaults to new on hub tab only', () => {
    expect(resolveSalesSubtab(new URLSearchParams('tab=vendas'))).toBe('new');
  });

  it('resolveSalesSubtab reads subtab', () => {
    expect(resolveSalesSubtab(new URLSearchParams('tab=vendas&subtab=history'))).toBe('history');
  });

  it('resolveSalesSubtab accepts legacy tab=new|history', () => {
    expect(resolveSalesSubtab(new URLSearchParams('tab=new'))).toBe('new');
    expect(resolveSalesSubtab(new URLSearchParams('tab=historico'))).toBe('history');
  });

  it('lojaVendasTabParams keeps hub tab vendas', () => {
    const next = lojaVendasTabParams('history', new URLSearchParams('tab=new'));
    expect(next.get('tab')).toBe('vendas');
    expect(next.get('subtab')).toBe('history');
  });

  it('resolveSalesPdvMode reads pdv=1', () => {
    expect(resolveSalesPdvMode(new URLSearchParams('tab=vendas&pdv=1'))).toBe(true);
    expect(resolveSalesPdvMode(new URLSearchParams('tab=vendas'))).toBe(false);
  });

  it('lojaVendasPdvParams toggles pdv query', () => {
    const on = lojaVendasPdvParams(true, new URLSearchParams('tab=vendas&subtab=new'));
    expect(on.get('pdv')).toBe('1');
    const off = lojaVendasPdvParams(false, on);
    expect(off.get('pdv')).toBeNull();
  });

  it('salesSubtabNeedsNormalize when legacy leaf tab hijacks hub', () => {
    expect(salesSubtabNeedsNormalize(new URLSearchParams('tab=new'))).toBe(true);
    expect(isLegacySalesLeafTab(new URLSearchParams('tab=new'))).toBe(true);
    expect(salesSubtabNeedsNormalize(new URLSearchParams('tab=vendas&subtab=new'))).toBe(false);
  });
});
