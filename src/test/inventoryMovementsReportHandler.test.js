import { describe, expect, it } from 'vitest';
import {
  aggregateMovesByProduct,
  computeOperationalTotals,
  inferMovementKind,
  resolveStockBalanceSnapshot,
} from '../../lib/server/inventoryMovementsReportHandler.js';

describe('inventoryMovementsReportHandler', () => {
  describe('inferMovementKind', () => {
    it('infere cadastro inicial por motivo ou referencia', () => {
      expect(inferMovementKind({ tipo: 'entrada', motivo: 'cadastro_inicial' })).toBe('initial');
      expect(inferMovementKind({ tipo: 'entrada', referencia_id: 'cadastro:var-1' })).toBe('initial');
    });

    it('infere devolução pelo tipo legado', () => {
      expect(inferMovementKind({ tipo: 'devolucao' })).toBe('return');
    });
  });

  describe('resolveStockBalanceSnapshot', () => {
    it('calcula saldo antes e depois quando quantity_before existe', () => {
      expect(resolveStockBalanceSnapshot({ quantity_before: 10 }, 5)).toEqual({
        quantity_before: 10,
        quantity_after: 15,
        balance_label: '10 → 15',
      });
    });

    it('retorna null quando quantity_before ausente', () => {
      expect(resolveStockBalanceSnapshot({}, -2)).toEqual({
        quantity_before: null,
        quantity_after: null,
        balance_label: null,
      });
    });
  });

  describe('computeOperationalTotals', () => {
    it('agrega entradas, saídas, ajustes e saldo líquido', () => {
      const totals = computeOperationalTotals([
        { tipo: 'entrada', quantidade: 10, movement_kind: 'entry' },
        { tipo: 'saida_venda', quantidade: 3, movement_kind: 'sale', line_total: 300 },
        { tipo: 'ajuste', quantidade: 2, referencia_id: 'adjustment:+', movement_kind: 'adjustment' },
        { tipo: 'ajuste', quantidade: 1, referencia_id: 'adjustment:-', movement_kind: 'adjustment' },
        { tipo: 'devolucao', quantidade: 1, movement_kind: 'return' },
      ]);

      expect(totals.entradas_un).toBe(11);
      expect(totals.saidas_un).toBe(3);
      expect(totals.total_devolucoes).toBe(1);
      expect(totals.total_faturado).toBe(300);
      expect(totals.registros).toBe(5);
      expect(totals.saldo_liquido).toBeGreaterThan(0);
      expect(totals.with_balance_snapshot).toBe(0);
      expect(totals.without_balance_snapshot).toBe(5);
    });

    it('conta movimentos com quantity_before gravado', () => {
      const totals = computeOperationalTotals([
        { tipo: 'entrada', quantidade: 5, movement_kind: 'entry', quantity_before: 10 },
        { tipo: 'entrada', quantidade: 3, movement_kind: 'entry' },
      ]);
      expect(totals.with_balance_snapshot).toBe(1);
      expect(totals.without_balance_snapshot).toBe(1);
    });
  });

  describe('aggregateMovesByProduct', () => {
    it('agrega entradas e saídas por produto', () => {
      const stockMeta = new Map([
        ['item-a', { product_id: 'p1', product_name: 'Kimono' }],
        ['item-b', { product_id: 'p2', product_name: 'Faixa' }],
      ]);
      const productNames = new Map([
        ['p1', 'Kimono'],
        ['p2', 'Faixa'],
      ]);
      const rows = aggregateMovesByProduct(
        [
          { item_estoque_id: 'item-a', product_id: 'p1', tipo: 'entrada', quantidade: 5, movement_kind: 'entry' },
          { item_estoque_id: 'item-a', product_id: 'p1', tipo: 'saida_venda', quantidade: 2, movement_kind: 'sale' },
          { item_estoque_id: 'item-b', product_id: 'p2', tipo: 'entrada', quantidade: 3, movement_kind: 'entry' },
        ],
        stockMeta,
        productNames
      );

      expect(rows).toHaveLength(2);
      const kimono = rows.find((r) => r.product_id === 'p1');
      expect(kimono.entradas_un).toBe(5);
      expect(kimono.saidas_un).toBe(2);
      expect(kimono.saldo_liquido).toBe(3);
      expect(kimono.movimentos).toBe(2);
    });
  });
});
