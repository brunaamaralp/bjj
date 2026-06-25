/**
 * Detecção de divergência estoque ↔ Caixa em entradas de estoque.
 */

/**
 * @param {object} move linha mapeada (mapStockMoveRow) ou documento + ctx
 * @returns {{ has_issue: boolean, kind: string, message: string }}
 */
export function detectStockEntryInconsistency(move) {
  const tipo = String(move?.tipo || '').toLowerCase();
  if (tipo !== 'entrada') {
    return { has_issue: false, kind: '', message: '' };
  }

  const txStatus = String(move.financial_tx_status || '').toLowerCase();
  const txId = String(move.financial_tx_id || '').trim();
  const purchase = Number(move.purchase_price);
  const hasPurchase = Number.isFinite(purchase) && purchase > 0;
  const corrected = Boolean(String(move.corrected_by_move_id || '').trim());

  if (txId && txStatus === 'cancelled' && !corrected) {
    return {
      has_issue: true,
      kind: 'cash_reversed_stock_pending',
      message:
        'Despesa estornada no Caixa, mas o estoque ainda não foi ajustado. Use Corrigir entrada para alinhar a quantidade.',
    };
  }

  if (hasPurchase && !txId) {
    return {
      has_issue: true,
      kind: 'cash_missing_link',
      message:
        'Entrada com valor pago sem vínculo no Caixa. Peça ao administrador para vincular ou corrigir a entrada.',
    };
  }

  if (txId && txStatus === 'missing') {
    return {
      has_issue: true,
      kind: 'cash_tx_missing',
      message: 'Lançamento no Caixa não encontrado. Revise no Financeiro ou corrija a entrada.',
    };
  }

  return { has_issue: false, kind: '', message: '' };
}
