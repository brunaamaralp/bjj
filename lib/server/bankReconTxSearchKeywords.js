/**
 * Palavras-chave de busca para lançamentos na conciliação (R-11).
 */

/**
 * @param {object} tx
 * @param {{ responsavel?: string, payer_aliases?: Array<{ display?: string, normalized?: string }> }|null} payerCtx
 */
export function buildTxSearchKeywords(tx, payerCtx = null) {
  const parts = [
    tx?.lead_name,
    payerCtx?.responsavel,
    ...(payerCtx?.payer_aliases || []).flatMap((a) => [a.display, a.normalized]),
    tx?.planName,
    tx?.category,
    tx?.note,
  ];
  const normalized = parts
    .map((p) => String(p || '').trim().toLowerCase())
    .filter((p) => p.length >= 2);
  return [...new Set(normalized)];
}

/**
 * @param {Array} transactions
 * @param {Map<string, object>} payerContextByLeadId
 */
export function enrichUnmatchedTxForReconSearch(transactions, payerContextByLeadId = new Map()) {
  return (transactions || []).map((tx) => {
    const leadId = String(tx.lead_id || '').trim();
    const ctx = leadId ? payerContextByLeadId.get(leadId) : null;
    return {
      ...tx,
      responsavel: ctx?.responsavel || '',
      search_keywords: buildTxSearchKeywords(tx, ctx),
    };
  });
}
