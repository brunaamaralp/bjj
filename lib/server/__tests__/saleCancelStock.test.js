import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.SALE_ITEMS_COL = 'sale-items-col';
  process.env.STOCK_ITEMS_COL = 'stock-col';
  process.env.STOCK_MOVES_COL = 'stock-moves-col';
  return {
    listDocuments: vi.fn(),
    updateDocumentResilient: vi.fn(),
    createStockMoveDocument: vi.fn(),
    resolveStockDocument: vi.fn(),
  };
});

vi.mock('../appwriteSchemaResilient.js', () => ({
  updateDocumentResilient: (...args) => mocks.updateDocumentResilient(...args),
}));

vi.mock('../stockMoveFields.js', () => ({
  createStockMoveDocument: (...args) => mocks.createStockMoveDocument(...args),
}));

vi.mock('../productCatalogDb.js', () => ({
  resolveStockDocument: (...args) => mocks.resolveStockDocument(...args),
}));

vi.mock('../../../functions/stockBalance.mjs', () => ({
  itemDisplayName: () => 'Item',
}));

import {
  ensureSaleCancelStockRestored,
  isCancelStockMove,
  parseSaleItemsSnapshot,
} from '../saleCancelStock.js';

describe('saleCancelStock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateDocumentResilient.mockResolvedValue({});
    mocks.createStockMoveDocument.mockResolvedValue({ $id: 'move-1' });
  });

  it('parseSaleItemsSnapshot lê itens do JSON da venda', () => {
    const items = parseSaleItemsSnapshot({
      itens_snapshot_json: JSON.stringify([
        { item_estoque_id: 'stock-1', quantidade: 2, preco_unitario: 10, line_kind: 'sale' },
      ]),
    });
    expect(items).toHaveLength(1);
    expect(items[0].product_variant_id).toBe('stock-1');
    expect(items[0].quantidade).toBe(2);
  });

  it('isCancelStockMove reconhece entrada colapsada do schema', () => {
    expect(isCancelStockMove({ tipo: 'entrada', movement_kind: 'return' })).toBe(true);
    expect(isCancelStockMove({ tipo: 'entrada', movement_kind: 'sale' })).toBe(false);
    expect(isCancelStockMove({ tipo: 'saida', movement_kind: 'sale' })).toBe(false);
  });

  it('usa snapshot quando sale_items está vazio e ainda não há movimento de retorno', async () => {
    const databases = {
      listDocuments: mocks.listDocuments,
    };
    mocks.listDocuments.mockImplementation(async (_db, col) => {
      if (col === 'sale-items-col') return { documents: [] };
      if (col === 'stock-moves-col') return { documents: [] };
      return { documents: [] };
    });
    mocks.resolveStockDocument.mockResolvedValue({
      collection: 'stock-col',
      doc: {
        $id: 'stock-1',
        academy_id: 'acad-1',
        current_quantity: 0,
      },
    });

    const result = await ensureSaleCancelStockRestored(databases, {
      dbId: 'db',
      vendaId: 'sale-1',
      academyId: 'acad-1',
      motivo: 'Erro',
      usuarioId: 'u1',
      venda: {
        itens_snapshot_json: JSON.stringify([
          { item_estoque_id: 'stock-1', quantidade: 1, preco_unitario: 50 },
        ]),
      },
    });

    expect(result.restored).toBe(true);
    expect(result.items_source).toBe('snapshot');
    expect(mocks.updateDocumentResilient).toHaveBeenCalledWith(
      databases,
      'db',
      'stock-col',
      'stock-1',
      expect.objectContaining({ current_quantity: 1 })
    );
    expect(mocks.createStockMoveDocument).toHaveBeenCalled();
  });

  it('não duplica estorno se já existir movimento de retorno', async () => {
    const databases = { listDocuments: mocks.listDocuments };
    mocks.listDocuments.mockResolvedValue({
      documents: [{ $id: 'm1', tipo: 'entrada', movement_kind: 'return', referencia_id: 'sale-1' }],
    });

    const result = await ensureSaleCancelStockRestored(databases, {
      dbId: 'db',
      vendaId: 'sale-1',
      academyId: 'acad-1',
      motivo: 'Erro',
      usuarioId: 'u1',
      venda: {
        itens_snapshot_json: JSON.stringify([
          { item_estoque_id: 'stock-1', quantidade: 1 },
        ]),
      },
    });

    expect(result.already_done).toBe(true);
    expect(result.restored).toBe(false);
    expect(mocks.resolveStockDocument).not.toHaveBeenCalled();
  });

  it('falha se createStockMoveDocument retornar null', async () => {
    const databases = { listDocuments: mocks.listDocuments };
    mocks.listDocuments.mockResolvedValue({ documents: [] });
    mocks.createStockMoveDocument.mockResolvedValue(null);
    mocks.resolveStockDocument.mockResolvedValue({
      collection: 'stock-col',
      doc: { $id: 'stock-1', academy_id: 'acad-1', current_quantity: 0 },
    });

    await expect(
      ensureSaleCancelStockRestored(databases, {
        dbId: 'db',
        vendaId: 'sale-1',
        academyId: 'acad-1',
        motivo: 'Erro',
        usuarioId: 'u1',
        venda: {
          itens_snapshot_json: JSON.stringify([
            { item_estoque_id: 'stock-1', quantidade: 1 },
          ]),
        },
      })
    ).rejects.toMatchObject({ code: 'stock_move_create_failed' });
  });
});
