/**
 * Match determinístico extrato ↔ PagBank por gateway_charge_id.
 *
 * Limitação: extratos bancários tradicionais (CSV/OFX de conta corrente) raramente
 * incluem o charge_id do PagBank na descrição. O match automático via import manual
 * só é viável quando o item traz `gateway_charge_id` explícito (ex.: import EDI
 * `source_format=pagbank_edi`) ou quando o lançamento Nave já tem `gateway_charge_id`
 * e o extrato foi enriquecido na importação. Ver docs/finance/pagbank-gateway-deterministic-match.md.
 */
export const GATEWAY_PROVIDER_PAGBANK = 'pagbank';

export const RECONCILIATION_METHOD_GATEWAY = 'gateway_deterministic';
export const RECONCILIATION_METHOD_MANUAL = 'manual_confirm';

export const GATEWAY_MATCH_TIER = 'gateway_charge_id';

export function normalizeGatewayChargeId(value) {
  return String(value || '').trim().toUpperCase();
}

function parseMetadataChargeId(raw) {
  if (!raw) return '';
  if (typeof raw === 'object' && raw.gateway_charge_id) {
    return normalizeGatewayChargeId(raw.gateway_charge_id);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.gateway_charge_id) {
        return normalizeGatewayChargeId(parsed.gateway_charge_id);
      }
    } catch {
      void 0;
    }
  }
  return '';
}

/**
 * Extrai charge_id PagBank de um item de extrato (explícito ou metadado EDI).
 * Não infere IDs genéricos da descrição de extrato bancário tradicional.
 */
export function extractGatewayChargeIdFromBankItem(item) {
  const direct = item?.gateway_charge_id || item?.gatewayChargeId;
  if (direct) return normalizeGatewayChargeId(direct);

  const fromMeta =
    parseMetadataChargeId(item?.metadata) ||
    parseMetadataChargeId(item?.gateway_metadata) ||
    parseMetadataChargeId(item?.gatewayMetadata);
  if (fromMeta) return fromMeta;

  const desc = String(item?.description || '');
  const labeled = desc.match(
    /(?:charge[_\s-]?id|tid|transaction[_\s-]?code)\s*[:#]?\s*([A-Z0-9_-]{8,64})/i
  );
  if (labeled?.[1]) return normalizeGatewayChargeId(labeled[1]);

  return '';
}

export function financialTxGatewayChargeId(tx) {
  const direct = tx?.gateway_charge_id || tx?.gatewayChargeId;
  if (direct) return normalizeGatewayChargeId(direct);
  return '';
}

export function financialTxGatewayProvider(tx) {
  return String(tx?.gateway_provider || tx?.gatewayProvider || '').trim().toLowerCase();
}

export function isDeterministicGatewayMatch(item, tx) {
  const itemId = extractGatewayChargeIdFromBankItem(item);
  const txId = financialTxGatewayChargeId(tx);
  if (!itemId || !txId || itemId !== txId) return false;
  const provider = financialTxGatewayProvider(tx);
  if (provider && provider !== GATEWAY_PROVIDER_PAGBANK) return false;
  return true;
}

/**
 * @typedef {'matched'|'no_identifier'|'ambiguous'|'not_found'|'out_of_pool'} GatewayMatchKind
 */

/**
 * Tenta match determinístico (um único candidato no pool).
 * @param {object} item
 * @param {object[]} pool — FINANCIAL_TX elegíveis
 * @param {{ chargeIdToTxId?: Map<string, string|null> }} [lookup]
 */
export function tryDeterministicGatewayMatch(item, pool, lookup = {}) {
  const chargeId = extractGatewayChargeIdFromBankItem(item);
  if (!chargeId) return { kind: 'no_identifier' };

  const directHits = (pool || []).filter((tx) => isDeterministicGatewayMatch(item, tx));
  if (directHits.length > 1) return { kind: 'ambiguous', chargeId };
  if (directHits.length === 1) {
    return {
      kind: 'matched',
      chargeId,
      tx: directHits[0],
      reconciliation_method: RECONCILIATION_METHOD_GATEWAY,
      match_tier: GATEWAY_MATCH_TIER,
      via: 'financial_tx_field',
    };
  }

  const mapped = lookup.chargeIdToTxId?.get(chargeId);
  if (mapped === null) return { kind: 'ambiguous', chargeId };
  if (!mapped) return { kind: 'not_found', chargeId };

  const viaLookup = (pool || []).filter((tx) => String(tx.id || '') === String(mapped));
  if (viaLookup.length > 1) return { kind: 'ambiguous', chargeId };
  if (viaLookup.length === 1) {
    return {
      kind: 'matched',
      chargeId,
      tx: viaLookup[0],
      reconciliation_method: RECONCILIATION_METHOD_GATEWAY,
      match_tier: GATEWAY_MATCH_TIER,
      via: 'pagbank_payment_lookup',
    };
  }

  return { kind: 'out_of_pool', chargeId };
}
