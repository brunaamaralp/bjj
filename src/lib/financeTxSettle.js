import { settleFinancialTransactionById } from './financeTxSettleCore.js';
import { applyAccountingSideEffectsAuto } from './financeJournal.js';

export { settleFinancialTransactionById };

/**
 * Liquidação manual na UI — reutiliza diário automático.
 */
export function applySettleAccountingSideEffects(tx, academyId) {
  applyAccountingSideEffectsAuto(tx, academyId);
}
