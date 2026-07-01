/**
 * Persiste gateway_provider / gateway_charge_id em financial_tx após espelho PagBank.
 */
import { GATEWAY_PROVIDER_PAGBANK } from '../../src/lib/bankGatewayMatch.js';
import { financeTxOptionalPatchForAppwrite } from './financeTxFields.js';
import { updateDocumentResilient } from './appwriteSchemaResilient.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

export async function patchPagbankGatewayOnFinancialTx(
  databases,
  dbId,
  financialTxId,
  { paymentId, settlementId } = {}
) {
  const txId = String(financialTxId || '').trim();
  const chargeId = String(paymentId || '').trim().slice(0, 64);
  if (!txId || !chargeId || !FINANCIAL_TX_COL) return { ok: false, skipped: true };

  const patch = financeTxOptionalPatchForAppwrite({
    gateway_provider: GATEWAY_PROVIDER_PAGBANK,
    gateway_charge_id: chargeId,
    ...(settlementId
      ? { gateway_settlement_id: String(settlementId).trim().slice(0, 64) }
      : {}),
  });
  if (!Object.keys(patch).length) return { ok: false, skipped: true };

  try {
    await updateDocumentResilient(databases, dbId, FINANCIAL_TX_COL, txId, patch);
    return { ok: true };
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: 'pagbank_gateway_financial_tx_patch_failed',
        financial_tx_id: txId,
        charge_id: chargeId,
        error: e?.message || String(e),
      })
    );
    return { ok: false, error: e?.message || String(e) };
  }
}
