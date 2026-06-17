/**
 * Patches de quantidade para movimentações de inventário (entrada, ajuste, saída).
 */
import { buildAvailableQuantityPatch } from './dualStockPools.js';
import {
  buildCancelStockPatch,
  buildSaleStockPatch,
  LINE_KINDS,
} from './saleLineKind.js';
import { quantityDeltaForMoveType, resolveCurrentQuantity } from './stockInventory.js';

/**
 * Patch Appwrite para movimentação de estoque (exceto avulso).
 * @param {object} item documento variante/estoque
 * @param {string} [parentType] tipo do produto pai
 * @param {string} tipo tipo de movimento (entrada, ajuste, saida_venda, …)
 * @param {number} quantidade quantidade informada na movimentação
 */
export function buildInventoryMoveStockPatch(item, parentType, tipo, quantidade) {
  const tipoL = String(tipo || '').toLowerCase();
  const q = Math.abs(Math.trunc(Number(quantidade) || 0));

  if (tipoL === 'saida_venda') return buildSaleStockPatch(item, q, LINE_KINDS.SALE);
  if (tipoL === 'saida_aluguel') return buildSaleStockPatch(item, q, LINE_KINDS.RENTAL);
  if (tipoL === 'devolucao') return buildCancelStockPatch(item, q, LINE_KINDS.RENTAL);
  if (tipoL === 'reversao_venda') return buildCancelStockPatch(item, q, LINE_KINDS.SALE);

  const delta = quantityDeltaForMoveType(tipo, quantidade);
  const prev = resolveCurrentQuantity(item);
  return buildAvailableQuantityPatch(item, parentType, prev + delta);
}
