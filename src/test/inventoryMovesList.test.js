import { describe, expect, it, vi } from 'vitest';
import { mapStockMoveRow } from '../../lib/server/inventoryMovesList.js';

describe('mapStockMoveRow', () => {
  it('mapeia entrada com vínculo ao Caixa', () => {
    const row = mapStockMoveRow(
      {
        $id: 'move-1',
        item_estoque_id: 'item-1',
        tipo: 'entrada',
        quantidade: 5,
        purchase_price: 99.9,
        payment_method: 'pix',
        financial_tx_id: 'tx-1',
        $createdAt: '2026-06-25T10:00:00.000Z',
      },
      { item_label: 'Kimono · M', financial_tx_status: 'settled' }
    );

    expect(row).toMatchObject({
      id: 'move-1',
      item_label: 'Kimono · M',
      tipo: 'entrada',
      quantidade: 5,
      purchase_price: 99.9,
      financial_tx_id: 'tx-1',
      financial_tx_status: 'settled',
      has_cash_link: true,
    });
  });

  it('marca entrada sem financial_tx_id como só estoque', () => {
    const row = mapStockMoveRow({
      $id: 'move-2',
      item_estoque_id: 'item-2',
      tipo: 'entrada',
      quantidade: 3,
      $createdAt: '2026-06-25T11:00:00.000Z',
    });

    expect(row.has_cash_link).toBe(false);
    expect(row.financial_tx_id).toBe('');
  });

  it('marca inconsistência quando Caixa estornado sem ajuste', () => {
    const row = mapStockMoveRow(
      {
        $id: 'move-3',
        item_estoque_id: 'item-1',
        tipo: 'entrada',
        quantidade: 5,
        purchase_price: 80,
        financial_tx_id: 'tx-2',
        $createdAt: '2026-06-25T12:00:00.000Z',
      },
      { financial_tx_status: 'cancelled' }
    );
    expect(row.has_inconsistency).toBe(true);
    expect(row.inconsistency_kind).toBe('cash_reversed_stock_pending');
  });
});

describe('listAcademyStockMoves', () => {
  it('resolve rótulos e status do Caixa em paralelo por ids únicos', async () => {
    vi.stubEnv('VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID', 'financial_tx');
    vi.resetModules();
    const { listAcademyStockMoves: listMoves } = await import('../../lib/server/inventoryMovesList.js');

    const getDocument = vi.fn(async (_dbId, col, id) => {
      if (col === 'stock_items') {
        return { $id: id, academy_id: 'acad-1', nome: `Item ${id}` };
      }
      if (col === 'financial_tx') {
        return { $id: id, academyId: 'acad-1', status: id === 'tx-a' ? 'settled' : 'cancelled' };
      }
      throw new Error('not found');
    });

    const listDocuments = vi.fn(async () => ({
      documents: [
        {
          $id: 'move-1',
          item_estoque_id: 'item-a',
          tipo: 'entrada',
          quantidade: 2,
          financial_tx_id: 'tx-a',
          $createdAt: '2026-06-25T10:00:00.000Z',
        },
        {
          $id: 'move-2',
          item_estoque_id: 'item-a',
          tipo: 'saida_venda',
          quantidade: 1,
          financial_tx_id: 'tx-b',
          $createdAt: '2026-06-25T11:00:00.000Z',
        },
        {
          $id: 'move-3',
          item_estoque_id: 'item-b',
          tipo: 'entrada',
          quantidade: 3,
          $createdAt: '2026-06-25T12:00:00.000Z',
        },
      ],
    }));

    const databases = { listDocuments, getDocument };

    const out = await listMoves(databases, {
      dbId: 'db',
      stockMovesCol: 'stock_moves',
      stockItemsCol: 'stock_items',
      academyId: 'acad-1',
      limit: 50,
    });

    expect(out.moves).toHaveLength(3);
    expect(out.moves[0].item_label).toContain('Item item-a');
    expect(out.moves[0].financial_tx_status).toBe('settled');
    expect(out.moves[1].financial_tx_status).toBe('cancelled');
    expect(out.moves[2].item_label).toContain('Item item-b');
    const txCalls = getDocument.mock.calls.filter(([, col]) => col === 'financial_tx');
    expect(txCalls).toHaveLength(2);
    expect(txCalls.map(([, , id]) => id).sort()).toEqual(['tx-a', 'tx-b']);
  });
});
