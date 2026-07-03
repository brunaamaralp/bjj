import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/server/appwriteSchemaResilient.js', () => ({
  createDocumentResilient: vi.fn(),
}));

import { createDocumentResilient } from '../../lib/server/appwriteSchemaResilient.js';
import {
  derivePaymentStatusAtMove,
  paymentMethodFromPagamentos,
  cmvUnitFromTotals,
  stockMoveTipoForSchemaWrite,
  buildCadastroInicialStockMovePayload,
  recordCadastroInicialStockMove,
} from '../../lib/server/stockMoveFields.js';

describe('stockMoveFields', () => {
  beforeEach(() => {
    vi.mocked(createDocumentResilient).mockReset();
  });  it('derivePaymentStatusAtMove', () => {
    expect(derivePaymentStatusAtMove([], 100)).toBe('paid');
    expect(derivePaymentStatusAtMove([{ forma: 'pix', valor: 100 }], 100)).toBe('paid');
    expect(derivePaymentStatusAtMove([{ forma: 'pix', valor: 50 }], 100)).toBe('partial');
    expect(derivePaymentStatusAtMove([{ forma: 'pix', valor: 0 }], 100)).toBe('pending');
  });

  it('paymentMethodFromPagamentos', () => {
    expect(paymentMethodFromPagamentos([{ forma: 'pix', valor: 10 }])).toBe('pix');
    expect(paymentMethodFromPagamentos([])).toBeNull();
  });

  it('cmvUnitFromTotals', () => {
    expect(cmvUnitFromTotals(20, 2, {})).toBe(10);
    expect(cmvUnitFromTotals(null, 0, { average_cost: 5 })).toBe(5);
  });

  it('stockMoveTipoForSchemaWrite normaliza tipos granulares', () => {
    expect(stockMoveTipoForSchemaWrite('saida_venda')).toBe('saida');
    expect(stockMoveTipoForSchemaWrite('saida_aluguel')).toBe('saida');
    expect(stockMoveTipoForSchemaWrite('reversao_venda')).toBe('entrada');
    expect(stockMoveTipoForSchemaWrite('devolucao')).toBe('entrada');
    expect(stockMoveTipoForSchemaWrite('entrada')).toBe('entrada');
    expect(stockMoveTipoForSchemaWrite('ajuste')).toBe('ajuste');
  });

  it('buildCadastroInicialStockMovePayload', () => {
    const payload = buildCadastroInicialStockMovePayload({
      academyId: 'ac1',
      itemEstoqueId: 'var1',
      quantidade: 5,
      usuarioId: 'user1',
    });
    expect(payload.tipo).toBe('entrada');
    expect(payload.quantidade).toBe(5);
    expect(payload.motivo).toBe('cadastro_inicial');
    expect(payload.referencia_id).toBe('cadastro:var1');
    expect(payload.source).toBe('catalog');
  });

  it('recordCadastroInicialStockMove pula quando qty <= 0', async () => {
    const result = await recordCadastroInicialStockMove(
      {},
      {
        dbId: 'db',
        stockMovesCol: 'moves',
        academyId: 'ac1',
        itemEstoqueId: 'var1',
        quantidade: 0,
      }
    );
    expect(result.skipped).toBe(true);
    expect(createDocumentResilient).not.toHaveBeenCalled();
  });

  it('recordCadastroInicialStockMove grava entrada cadastro_inicial', async () => {
    vi.mocked(createDocumentResilient).mockResolvedValueOnce({ $id: 'move-1' });
    const result = await recordCadastroInicialStockMove(
      {},
      {
        dbId: 'db',
        stockMovesCol: 'moves',
        academyId: 'ac1',
        itemEstoqueId: 'var1',
        quantidade: 4,
        usuarioId: 'user1',
      }
    );
    expect(result.ok).toBe(true);
    expect(result.movimento_id).toBe('move-1');
    expect(createDocumentResilient).toHaveBeenCalledWith(
      {},
      'db',
      'moves',
      expect.any(String),
      expect.objectContaining({
        tipo: 'entrada',
        motivo: 'cadastro_inicial',
        item_estoque_id: 'var1',
        quantidade: 4,
        referencia_id: 'cadastro:var1',
      })
    );
  });

  it('recordCadastroInicialStockMove falha quando gravação retorna null', async () => {
    vi.mocked(createDocumentResilient).mockRejectedValueOnce(new Error('schema'));
    const result = await recordCadastroInicialStockMove(
      {},
      {
        dbId: 'db',
        stockMovesCol: 'moves',
        academyId: 'ac1',
        itemEstoqueId: 'var1',
        quantidade: 2,
      }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('stock_move_create_failed');
  });
});