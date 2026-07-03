import { describe, it, expect } from 'vitest';
import {
  SALE_MOVE_BACKFILL_MOTIVO,
  buildSaleStockMoveBackfillPayload,
  buildSaleStockMoveBackfillPlan,
  buildStockIdResolverContext,
  isSaleMoveBackfillMove,
  resolveStockIdToVariant,
  stockMoveTipoForSchemaWrite,
  summarizeSaleStockMoveBackfillPlan,
} from '../lib/backfillStockSalesMoves.js';

describe('backfillStockSalesMoves', () => {
  it('isSaleMoveBackfillMove detecta source ou motivo', () => {
    expect(isSaleMoveBackfillMove({ source: 'audit_backfill' })).toBe(true);
    expect(isSaleMoveBackfillMove({ motivo: SALE_MOVE_BACKFILL_MOTIVO })).toBe(true);
    expect(isSaleMoveBackfillMove({ motivo: 'venda' })).toBe(false);
  });

  it('resolveStockIdToVariant mapeia legacy_stock_item_id', () => {
    const ctx = buildStockIdResolverContext(
      [{ $id: 'v-new', legacy_stock_item_id: 'si-old' }],
      []
    );
    expect(resolveStockIdToVariant('si-old', ctx)?.id).toBe('v-new');
  });

  it('buildSaleStockMoveBackfillPlan cria saída para venda sem movimento', () => {
    const saleItems = [
      {
        $id: 'si1',
        venda_id: 'sale1',
        item_estoque_id: 'v1',
        quantidade: 2,
        line_kind: 'sale',
      },
    ];
    const moves = [];
    const ctx = buildStockIdResolverContext([{ $id: 'v1' }], []);
    ctx.academyId = 'ac1';

    const { plan, skipped } = buildSaleStockMoveBackfillPlan(saleItems, moves, ctx);
    expect(plan).toHaveLength(1);
    expect(plan[0].sale_id).toBe('sale1');
    expect(plan[0].item_estoque_id).toBe('v1');
    expect(plan[0].tipo).toBe('saida');
    expect(plan[0].tipo_granular).toBe('saida_venda');
    expect(skipped).toHaveLength(0);
  });

  it('ignora linha quando stock id não resolve', () => {
    const saleItems = [
      { $id: 'si1', venda_id: 'sale1', item_estoque_id: 'ghost', quantidade: 1 },
    ];
    const ctx = buildStockIdResolverContext([{ $id: 'v1' }], []);
    const { plan, skipped } = buildSaleStockMoveBackfillPlan(saleItems, [], ctx);
    expect(plan).toHaveLength(0);
    expect(skipped[0].reason).toBe('unknown_stock_id');
  });

  it('não duplica quando movimento de venda já existe', () => {
    const saleItems = [
      { $id: 'si1', venda_id: 'sale1', item_estoque_id: 'v1', quantidade: 1 },
    ];
    const moves = [
      {
        item_estoque_id: 'v1',
        sale_id: 'sale1',
        sale_item_id: 'si1',
        tipo: 'saida_venda',
        quantidade: 1,
        referencia_id: 'sale1',
      },
    ];
    const ctx = buildStockIdResolverContext([{ $id: 'v1' }], []);
    const { plan } = buildSaleStockMoveBackfillPlan(saleItems, moves, ctx);
    expect(plan).toHaveLength(0);
  });

  it('stockMoveTipoForSchemaWrite mapeia saida_venda para saida', () => {
    expect(stockMoveTipoForSchemaWrite('saida_venda')).toBe('saida');
    expect(stockMoveTipoForSchemaWrite('entrada')).toBe('entrada');
  });

  it('buildSaleStockMoveBackfillPayload inclui sale_id e sale_item_id', () => {
    const payload = buildSaleStockMoveBackfillPayload({
      academy_id: 'ac1',
      sale_id: 'sale1',
      sale_item_id: 'si1',
      item_estoque_id: 'v1',
      quantidade: 3,
      line_kind: 'rental',
    });
    expect(payload.tipo).toBe('saida');
    expect(payload.referencia_id).toBe('sale1');
    expect(payload.sale_item_id).toBe('si1');
    expect(payload.source).toBe('audit_backfill');
  });

  it('summarizeSaleStockMoveBackfillPlan agrega vendas', () => {
    const s = summarizeSaleStockMoveBackfillPlan(
      [
        { sale_id: 's1', quantidade: 2, stock_resolve_method: 'direct' },
        { sale_id: 's1', quantidade: 1, stock_resolve_method: 'direct' },
      ],
      []
    );
    expect(s.lines_to_backfill).toBe(2);
    expect(s.total_units).toBe(3);
    expect(s.sales_affected).toBe(1);
  });
});
