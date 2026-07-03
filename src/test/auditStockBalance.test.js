import { describe, it, expect } from 'vitest';
import {
  sumStockMoveDeltas,
  classifyStockDelta,
  buildStockBalanceAuditRow,
  buildStockMoveLedger,
  findSaleItemsMissingStockMove,
  indexStockMoveKeysBySaleId,
  STOCK_DELTA_CAUSES,
} from '../lib/auditStockBalance.js';

describe('auditStockBalance', () => {
  it('sumStockMoveDeltas soma entradas e saídas', () => {
    const moves = [
      { tipo: 'entrada', quantidade: 10 },
      { tipo: 'saida_venda', quantidade: 3 },
      { tipo: 'reversao_venda', quantidade: 1 },
      { tipo: 'avulso', quantidade: 99 },
    ];
    expect(sumStockMoveDeltas(moves)).toBe(8);
  });

  it('sumStockMoveDeltas respeita sinal de ajuste via referencia_id', () => {
    const moves = [
      { tipo: 'entrada', quantidade: 5 },
      { tipo: 'ajuste', quantidade: 2, referencia_id: 'adjustment:out' },
    ];
    expect(sumStockMoveDeltas(moves)).toBe(3);
  });

  it('classifyStockDelta identifica saldo legado sem movimentos', () => {
    expect(classifyStockDelta(5, 0, 5)).toBe(STOCK_DELTA_CAUSES.LEGACY_OR_DIRECT_BALANCE);
    expect(classifyStockDelta(0, 0, 0)).toBe(STOCK_DELTA_CAUSES.OK_EMPTY);
    expect(classifyStockDelta(0, 3, 10)).toBe(STOCK_DELTA_CAUSES.OK);
    expect(classifyStockDelta(2, 2, 12)).toBe(STOCK_DELTA_CAUSES.BALANCE_HIGHER_THAN_MOVES);
    expect(classifyStockDelta(-2, 2, 8)).toBe(STOCK_DELTA_CAUSES.BALANCE_LOWER_THAN_MOVES);
  });

  it('buildStockBalanceAuditRow calcula delta e sugestão de saldo inicial', () => {
    const item = { $id: 'v1', current_quantity: 12, nome: 'Kimono', size: 'M' };
    const moves = [
      { $createdAt: '2026-01-01T10:00:00Z', tipo: 'entrada', quantidade: 5 },
      { $createdAt: '2026-01-02T10:00:00Z', tipo: 'saida_venda', quantidade: 2 },
    ];
    const row = buildStockBalanceAuditRow(item, moves, { academy_id: 'ac1' });
    expect(row.current_quantity).toBe(12);
    expect(row.calculated_quantity).toBe(3);
    expect(row.delta).toBe(9);
    expect(row.opening_balance_suggestion).toBe(9);
    expect(row.probable_cause).toBe(STOCK_DELTA_CAUSES.BALANCE_HIGHER_THAN_MOVES);
  });

  it('buildStockMoveLedger acumula saldo running', () => {
    const ledger = buildStockMoveLedger([
      { $id: 'm1', $createdAt: '2026-01-01T10:00:00Z', tipo: 'entrada', quantidade: 10 },
      { $id: 'm2', $createdAt: '2026-01-02T10:00:00Z', tipo: 'saida_venda', quantidade: 4 },
    ]);
    expect(ledger).toHaveLength(2);
    expect(ledger[0].running_balance).toBe(10);
    expect(ledger[1].running_balance).toBe(6);
  });

  it('sumStockMoveDeltas trata tipo saida legado', () => {
    expect(sumStockMoveDeltas([{ tipo: 'saida', quantidade: 2 }])).toBe(-2);
  });

  it('findSaleItemsMissingStockMove detecta venda sem movimento', () => {
    const saleItems = [
      { $id: 'si1', venda_id: 'sale1', item_estoque_id: 'v1', quantidade: 2 },
    ];
    const moves = [
      {
        item_estoque_id: 'v1',
        sale_id: 'sale2',
        referencia_id: 'sale2',
        tipo: 'saida_venda',
        quantidade: 1,
      },
    ];
    const byItem = new Map([['v1', moves]]);
    const bySale = indexStockMoveKeysBySaleId(moves);
    const missing = findSaleItemsMissingStockMove(saleItems, bySale, byItem);
    expect(missing).toHaveLength(1);
    expect(missing[0].sale_id).toBe('sale1');
  });

  it('findSaleItemsMissingStockMove ignora tipo saida legado vinculado', () => {
    const saleItems = [
      { $id: 'si1', venda_id: 'sale1', item_estoque_id: 'v1', quantidade: 1 },
    ];
    const moves = [
      {
        item_estoque_id: 'v1',
        referencia_id: 'sale1',
        tipo: 'saida',
        quantidade: 1,
      },
    ];
    const byItem = new Map([['v1', moves]]);
    const bySale = indexStockMoveKeysBySaleId(moves);
    const missing = findSaleItemsMissingStockMove(saleItems, bySale, byItem);
    expect(missing).toHaveLength(0);
  });

  it('findSaleItemsMissingStockMove reconhece sale_item_id com stock id remapeado', () => {
    const saleItems = [
      { $id: 'si1', venda_id: 'sale1', item_estoque_id: 'old-stock', quantidade: 1 },
    ];
    const moves = [
      {
        item_estoque_id: 'v-new',
        sale_item_id: 'si1',
        referencia_id: 'sale1',
        tipo: 'saida',
        quantidade: 1,
      },
    ];
    const byItem = new Map([['old-stock', []], ['v-new', moves]]);
    const bySale = indexStockMoveKeysBySaleId(moves);
    const missing = findSaleItemsMissingStockMove(saleItems, bySale, byItem);
    expect(missing).toHaveLength(0);
  });
});
