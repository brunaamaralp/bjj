import { describe, expect, it } from 'vitest';
import { shouldRevertWacAfterEntryCorrection } from '../../lib/server/stockEntryWac.js';
import { detectStockEntryInconsistency } from '../lib/stockEntryInconsistency.js';
import {
  buildStockEntryLinkPatches,
  findStockEntryFinancialMatch,
  grossMatchesPurchase,
  noteMatchesStockPurchase,
} from '../../lib/server/stockEntryFinancialLinkBackfill.js';

describe('shouldRevertWacAfterEntryCorrection', () => {
  it('reverte quando saldo volta ao snapshot', () => {
    expect(
      shouldRevertWacAfterEntryCorrection(
        { quantity_before: 5, average_cost_before: 10 },
        5
      )
    ).toBe(true);
  });

  it('não reverte quando saldo difere do snapshot', () => {
    expect(
      shouldRevertWacAfterEntryCorrection(
        { quantity_before: 5, average_cost_before: 10 },
        8
      )
    ).toBe(false);
  });
});

describe('detectStockEntryInconsistency', () => {
  it('detecta Caixa estornado sem ajuste de estoque', () => {
    const out = detectStockEntryInconsistency({
      tipo: 'entrada',
      financial_tx_id: 'tx-1',
      financial_tx_status: 'cancelled',
      purchase_price: 100,
      corrected_by_move_id: '',
    });
    expect(out.has_issue).toBe(true);
    expect(out.kind).toBe('cash_reversed_stock_pending');
  });

  it('ignora quando já houve correção de estoque', () => {
    const out = detectStockEntryInconsistency({
      tipo: 'entrada',
      financial_tx_id: 'tx-1',
      financial_tx_status: 'cancelled',
      purchase_price: 100,
      corrected_by_move_id: 'adj-1',
    });
    expect(out.has_issue).toBe(false);
  });

  it('detecta entrada com valor sem vínculo', () => {
    const out = detectStockEntryInconsistency({
      tipo: 'entrada',
      financial_tx_id: '',
      purchase_price: 50,
    });
    expect(out.kind).toBe('cash_missing_link');
  });
});

describe('stock entry financial backfill', () => {
  it('encontra match único por nota, valor e janela temporal', () => {
    const move = {
      $id: 'move-1',
      academy_id: 'acad-1',
      purchase_price: 120,
      $createdAt: '2026-06-25T12:00:00.000Z',
    };
    const tx = {
      $id: 'tx-1',
      academyId: 'acad-1',
      type: 'stock_purchase',
      gross: 120,
      note: 'Compra de estoque: Kimono — 10 unidade',
      $createdAt: '2026-06-25T12:02:00.000Z',
      origin_id: '',
    };
    const match = findStockEntryFinancialMatch(move, [tx], 'Kimono');
    expect(match?.$id).toBe('tx-1');
    expect(buildStockEntryLinkPatches('move-1', 'tx-1').tx.origin_type).toBe('stock_entry');
  });

  it('rejeita quando há mais de um candidato', () => {
    const move = {
      $id: 'move-1',
      academy_id: 'acad-1',
      purchase_price: 120,
      $createdAt: '2026-06-25T12:00:00.000Z',
    };
    const txs = [
      {
        $id: 'tx-1',
        academyId: 'acad-1',
        type: 'stock_purchase',
        gross: 120,
        note: 'Compra de estoque: Kimono — 10 unidade',
        $createdAt: '2026-06-25T12:01:00.000Z',
      },
      {
        $id: 'tx-2',
        academyId: 'acad-1',
        type: 'stock_purchase',
        gross: 120,
        note: 'Compra de estoque: Kimono — 5 unidade',
        $createdAt: '2026-06-25T12:03:00.000Z',
      },
    ];
    expect(findStockEntryFinancialMatch(move, txs, 'Kimono')).toBeNull();
  });
});

describe('noteMatchesStockPurchase', () => {
  it('aceita prefixo com quantidade', () => {
    expect(noteMatchesStockPurchase('Compra de estoque: Kimono — 3 un', 'Kimono')).toBe(true);
  });
});

describe('grossMatchesPurchase', () => {
  it('tolera centavos', () => {
    expect(grossMatchesPurchase(99.99, 100)).toBe(true);
  });
});
